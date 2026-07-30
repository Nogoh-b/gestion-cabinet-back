import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { ExpenseReport, ExpenseReportStatus } from './entities/expense-report.entity';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import { UpdateExpenseReportDto } from './dto/update-expense-report.dto';
import { ReimburseExpenseReportDto } from './dto/reimburse-expense-report.dto';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';

export interface ExpenseReportActor {
  userId?: number | null;
  role?: string | null;
}

@Injectable()
export class ExpenseReportsService extends BaseServiceV1<ExpenseReport> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(ExpenseReport)
    protected repository: Repository<ExpenseReport>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly planQuotaService: PlanQuotaService,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['title', 'notes'],
      exactMatchFields: ['id', 'employee_id', 'approved_by_id', 'status'],
      dateRangeFields: ['submission_date', 'reimbursement_date'],
      relationFields: [
        'employee',
        'approved_by',
        'reimbursed_by',
        'lines',
      ],
    };
  }

  async create(dto: CreateExpenseReportDto): Promise<ExpenseReport> {
    const tenantId = getCurrentTenantId();
    await this.planQuotaService.checkModuleEnabled(tenantId, 'expenses');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let query = this.repository
      .createQueryBuilder('expense')
      .where('expense.created_at >= :start', { start: monthStart });
    query = addTenantCondition(query, 'expense');
    await this.planQuotaService.checkLimit(
      tenantId,
      'expenses',
      await query.getCount(),
    );

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employee_id, tenant_id: tenantId },
    });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    const totalAmount = this.fromMinorUnits(
      this.toMinorUnits(dto.total_amount),
    );
    const entity = this.repository.create();
    Object.assign(entity, {
      ...dto,
      employee,
      employee_id: employee.id,
      total_amount: totalAmount,
      submission_date: new Date(dto.submission_date),
      status: ExpenseReportStatus.DRAFT,
      approved_by_id: null,
      approved_by: null,
      approved_at: null,
      rejected_at: null,
      rejection_reason: null,
      reimbursement_date: null,
      reimbursement_method: null,
      reimbursement_reference: null,
      reimbursed_by_id: null,
      reimbursed_by: null,
      tenant_id: tenantId,
    });
    return this.repository.save(entity);
  }

  findAll(): Promise<ExpenseReport[]> {
    return this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: ['employee', 'approved_by', 'reimbursed_by'],
      order: { submission_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ExpenseReport> {
    const report = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: [
        'employee',
        'approved_by',
        'reimbursed_by',
        'lines',
        'lines.dossier',
      ],
    });
    if (!report) throw new NotFoundException('Note de frais non trouvée');
    return report;
  }

  findByEmployee(employeeId: number): Promise<ExpenseReport[]> {
    return this.repository.find({
      where: {
        employee_id: employeeId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee'],
      order: { submission_date: 'DESC' },
    });
  }

  async submit(
    id: number,
    actor: ExpenseReportActor,
  ): Promise<ExpenseReport> {
    return this.dataSource.transaction(async (manager) => {
      const report = await this.lockReport(manager, id);
      if (
        ![
          ExpenseReportStatus.DRAFT,
          ExpenseReportStatus.REJECTED,
        ].includes(report.status)
      ) {
        throw new BadRequestException(
          'Seule une note brouillon ou rejetée peut être soumise',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (
        actor.role !== 'admin' &&
        user.employee?.id !== report.employee_id
      ) {
        throw new ForbiddenException(
          'Seul l’auteur de la note peut la soumettre',
        );
      }
      if (!report.lines?.length) {
        throw new BadRequestException(
          'La note de frais doit contenir au moins une ligne',
        );
      }
      const totalMinor = report.lines.reduce(
        (sum, line) => sum + this.toMinorUnits(line.amount_ttc),
        0,
      );
      if (totalMinor <= 0) {
        throw new BadRequestException(
          'Le total de la note de frais doit être positif',
        );
      }
      report.total_amount = this.fromMinorUnits(totalMinor);
      report.status = ExpenseReportStatus.SUBMITTED;
      report.rejection_reason = null;
      report.rejected_at = null;
      const saved = await manager.getRepository(ExpenseReport).save(report);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'expense_report.submitted',
        resourceType: 'expense_report',
        resourceId: saved.id,
        beforeState: { status: ExpenseReportStatus.DRAFT },
        afterState: {
          status: saved.status,
          totalAmount: saved.total_amount,
        },
      });
      return saved;
    });
  }

  async approve(
    id: number,
    actor: ExpenseReportActor,
  ): Promise<ExpenseReport> {
    return this.dataSource.transaction(async (manager) => {
      const report = await this.lockReport(manager, id);
      if (report.status !== ExpenseReportStatus.SUBMITTED) {
        throw new BadRequestException(
          'Seule une note soumise peut être approuvée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (!user.employee) {
        throw new ForbiddenException(
          'Le validateur doit être rattaché à un collaborateur',
        );
      }
      if (user.employee.id === report.employee_id) {
        throw new ForbiddenException(
          'L’auteur de la note ne peut pas l’approuver lui-même',
        );
      }
      report.status = ExpenseReportStatus.APPROVED;
      report.approved_by_id = user.employee.id;
      report.approved_by = user.employee;
      report.approved_at = new Date();
      const saved = await manager.getRepository(ExpenseReport).save(report);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'expense_report.approved',
        resourceType: 'expense_report',
        resourceId: saved.id,
        beforeState: { status: ExpenseReportStatus.SUBMITTED },
        afterState: {
          status: saved.status,
          approvedByEmployeeId: saved.approved_by_id,
          approvedAt: saved.approved_at,
        },
      });
      return saved;
    });
  }

  async reject(
    id: number,
    rawReason: string,
    actor: ExpenseReportActor,
  ): Promise<ExpenseReport> {
    const reason = rawReason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Un motif explicite d’au moins 10 caractères est obligatoire',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const report = await this.lockReport(manager, id);
      if (report.status !== ExpenseReportStatus.SUBMITTED) {
        throw new BadRequestException(
          'Seule une note soumise peut être rejetée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (!user.employee) {
        throw new ForbiddenException(
          'Le validateur doit être rattaché à un collaborateur',
        );
      }
      if (user.employee.id === report.employee_id) {
        throw new ForbiddenException(
          'L’auteur de la note ne peut pas la rejeter lui-même',
        );
      }
      report.status = ExpenseReportStatus.REJECTED;
      report.approved_by_id = user.employee.id;
      report.approved_by = user.employee;
      report.rejected_at = new Date();
      report.rejection_reason = reason;
      const saved = await manager.getRepository(ExpenseReport).save(report);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'expense_report.rejected',
        resourceType: 'expense_report',
        resourceId: saved.id,
        beforeState: { status: ExpenseReportStatus.SUBMITTED },
        afterState: {
          status: saved.status,
          rejectedAt: saved.rejected_at,
        },
        justification: reason,
      });
      return saved;
    });
  }

  async markReimbursed(
    id: number,
    dto: ReimburseExpenseReportDto,
    actor: ExpenseReportActor,
  ): Promise<ExpenseReport> {
    const reimbursementDate = dto.reimbursementDate
      ? new Date(dto.reimbursementDate)
      : new Date();
    if (
      Number.isNaN(reimbursementDate.getTime()) ||
      reimbursementDate.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('Date de remboursement invalide');
    }
    return this.dataSource.transaction(async (manager) => {
      const report = await this.lockReport(manager, id);
      if (report.status !== ExpenseReportStatus.APPROVED) {
        throw new BadRequestException(
          'Seule une note approuvée peut être remboursée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      report.status = ExpenseReportStatus.REIMBURSED;
      report.reimbursement_date = reimbursementDate;
      report.reimbursement_method = dto.paymentMethod;
      report.reimbursement_reference = dto.paymentReference.trim();
      report.reimbursed_by_id = user.id;
      report.reimbursed_by = user;
      const saved = await manager.getRepository(ExpenseReport).save(report);
      const audit = await this.auditService.append(manager, {
        actorId: user.id,
        action: 'expense_report.reimbursed',
        resourceType: 'expense_report',
        resourceId: saved.id,
        beforeState: { status: ExpenseReportStatus.APPROVED },
        afterState: {
          status: saved.status,
          reimbursementDate: saved.reimbursement_date,
          reimbursementMethod: saved.reimbursement_method,
          reimbursementReference: saved.reimbursement_reference,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'expense_report.reimbursed',
        aggregateType: 'expense_report',
        aggregateId: saved.id,
        idempotencyKey: `expense-report-reimbursed:${audit.id}`,
        payload: {
          expenseReportId: saved.id,
          title: saved.title,
          totalAmount: Number(saved.total_amount),
          reimbursementDate: saved.reimbursement_date,
          reimbursementMethod: saved.reimbursement_method,
          reimbursementReference: saved.reimbursement_reference,
          employeeName: saved.employee?.full_name ?? null,
          lines: (saved.lines ?? []).map((line) => ({
            category: line.category,
            description: line.description,
            amount_ttc: Number(line.amount_ttc),
          })),
        },
      });
      return saved;
    });
  }

  async update(
    id: number,
    dto: UpdateExpenseReportDto,
  ): Promise<ExpenseReport> {
    const report = await this.findOne(id);
    if (
      ![
        ExpenseReportStatus.DRAFT,
        ExpenseReportStatus.REJECTED,
      ].includes(report.status)
    ) {
      throw new BadRequestException(
        'Seule une note brouillon ou rejetée peut être modifiée',
      );
    }
    let employee = report.employee;
    if (dto.employee_id && dto.employee_id !== report.employee_id) {
      const resolved = await this.employeeRepo.findOne({
        where: {
          id: dto.employee_id,
          tenant_id: getCurrentTenantId(),
        },
      });
      if (!resolved) throw new NotFoundException('Employé non trouvé');
      employee = resolved;
    }
    Object.assign(report, {
      ...dto,
      employee,
      employee_id: employee.id,
      submission_date: dto.submission_date
        ? new Date(dto.submission_date)
        : report.submission_date,
      total_amount:
        dto.total_amount === undefined
          ? report.total_amount
          : this.fromMinorUnits(this.toMinorUnits(dto.total_amount)),
      status: report.status,
      approved_by_id: report.approved_by_id,
      tenant_id: report.tenant_id,
    });
    return this.repository.save(report);
  }

  async remove(): Promise<never> {
    throw new BadRequestException(
      'La suppression physique d’une note de frais est interdite',
    );
  }

  private async lockReport(
    manager: EntityManager,
    id: number,
  ): Promise<ExpenseReport> {
    const report = await manager.getRepository(ExpenseReport).findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: ['employee', 'lines', 'lines.dossier'],
      lock: { mode: 'pessimistic_write' },
    });
    if (!report) throw new NotFoundException('Note de frais non trouvée');
    return report;
  }

  private async resolveActor(
    manager: EntityManager,
    actor: ExpenseReportActor,
  ): Promise<User> {
    const actorId = Number(actor?.userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('Acteur authentifié obligatoire');
    }
    const user = await manager.getRepository(User).findOne({
      where: { id: actorId, tenant_id: getCurrentTenantId() },
      relations: ['employee'],
    });
    if (!user) throw new ForbiddenException('Utilisateur introuvable');
    return user;
  }

  private toMinorUnits(value: number | string): number {
    const numeric = Number(value);
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Les montants utilisent au plus deux décimales',
      );
    }
    return rounded;
  }

  private fromMinorUnits(value: number): number {
    return value / 100;
  }
}
