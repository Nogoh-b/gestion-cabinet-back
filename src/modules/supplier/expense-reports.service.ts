import { DataSource, Repository } from 'typeorm';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from './entities/expense-report.entity';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import { UpdateExpenseReportDto } from './dto/update-expense-report.dto';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { CaseBillingService } from '../case-workflow/services/case-billing.service';
import { BillableItemStatus } from '../case-workflow/case-workflow.enums';

@Injectable()
export class ExpenseReportsService extends BaseServiceV1<ExpenseReport> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(ExpenseReport)
    protected repository: Repository<ExpenseReport>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    private readonly eventEmitter: EventEmitter2,
    private readonly planQuotaService: PlanQuotaService,
    private readonly dataSource: DataSource,
    private readonly caseBillingService: CaseBillingService,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateExpenseReportDto): Promise<ExpenseReport> {
    // ── Le module Dépenses doit être inclus dans le plan + quota mensuel ─────
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      await this.planQuotaService.checkModuleEnabled(tenantId, 'expenses');
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      let qb = this.repository
        .createQueryBuilder('e')
        .where('e.created_at >= :start', { start: monthStart });
      qb = addTenantCondition(qb, 'e');
      const currentCount = await qb.getCount();
      await this.planQuotaService.checkLimit(
        tenantId,
        'expenses',
        currentCount,
      );
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employee_id },
    });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    const entity = this.repository.create(dto);
    entity.employee = employee;
    return this.repository.save(entity);
  }

  findAll(): Promise<ExpenseReport[]> {
    return this.repository.find({
      relations: ['employee', 'approved_by'],
      order: { submission_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<ExpenseReport> {
    const report = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'approved_by', 'lines', 'lines.dossier'],
    });
    if (!report) throw new NotFoundException('Note de frais non trouvée');
    return report;
  }

  async findByEmployee(employee_id: number): Promise<ExpenseReport[]> {
    return this.repository.find({
      where: { employee_id },
      relations: ['employee'],
      order: { submission_date: 'DESC' },
    });
  }

  async approve(id: number, userId: number): Promise<ExpenseReport> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const reportRepository = manager.getRepository(ExpenseReport);
      const report = await reportRepository.findOne({
        where: { id, tenant_id: tenantId },
        relations: ['lines', 'lines.dossier'],
      });
      if (!report) throw new NotFoundException('Note de frais non trouvée');
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('Utilisateur non trouvé');
      report.status = ExpenseReportStatus.APPROVED;
      report.approved_by = user as any;
      const saved = await reportRepository.save(report);
      for (const line of report.lines ?? []) {
        line.expense_report = saved;
        await this.caseBillingService.syncExpenseLineToBillableItem(
          manager,
          line,
          userId,
          true,
        );
      }
      return saved;
    });
  }

  async reject(
    id: number,
    userId: number,
    notes: string,
  ): Promise<ExpenseReport> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const reportRepository = manager.getRepository(ExpenseReport);
      const report = await reportRepository.findOne({
        where: { id, tenant_id: tenantId },
        relations: ['lines', 'lines.dossier'],
      });
      if (!report) throw new NotFoundException('Note de frais non trouvée');
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('Utilisateur non trouvé');
      report.status = ExpenseReportStatus.REJECTED;
      report.approved_by = user as any;
      report.notes = notes;
      const saved = await reportRepository.save(report);
      for (const line of report.lines ?? []) {
        line.expense_report = saved;
        await this.caseBillingService.syncExpenseLineToBillableItem(
          manager,
          line,
          userId,
          false,
        );
      }
      return saved;
    });
  }

  async markReimbursed(
    id: number,
    actorUserId: number | null = null,
  ): Promise<ExpenseReport> {
    const report = await this.findOne(id);
    report.status = 'reimbursed' as any;
    report.reimbursement_date = new Date();
    const saved = await this.repository.save(report);
    for (const line of report.lines ?? []) {
      await this.caseBillingService.syncExpenseLineById(
        line.id,
        actorUserId,
      );
    }
    const full = await this.findOne(saved.id);
    this.eventEmitter.emit('expense_report.remboursee', full);
    return saved;
  }

  async update(
    id: number,
    dto: UpdateExpenseReportDto,
    actorUserId?: number,
  ): Promise<ExpenseReport> {
    if (dto.status === ExpenseReportStatus.APPROVED && actorUserId) {
      return this.approve(id, actorUserId);
    }
    if (dto.status === ExpenseReportStatus.REJECTED && actorUserId) {
      return this.reject(id, actorUserId, dto.notes ?? 'Note rejetée');
    }
    if (dto.status === ExpenseReportStatus.REIMBURSED) {
      return this.markReimbursed(id, actorUserId ?? null);
    }
    const report = await this.findOne(id);
    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({
        where: { id: dto.employee_id },
      });
      if (!employee) throw new NotFoundException('Employé non trouvé');
      report.employee = employee;
    }
    const saved = await this.repository.save({ ...report, ...dto });
    if (dto.status !== undefined) {
      for (const line of report.lines ?? []) {
        await this.caseBillingService.syncExpenseLineById(
          line.id,
          actorUserId ?? null,
        );
      }
    }
    return saved;
  }

  async remove(id: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ExpenseReport);
      const report = await repository.findOne({
        where: { id, tenant_id: tenantId },
        relations: ['lines'],
      });
      if (!report) throw new NotFoundException('Note de frais non trouvée');
      for (const line of report.lines ?? []) {
        line.expense_report = report;
        const item = await this.caseBillingService.syncExpenseLineToBillableItem(
          manager,
          line,
          null,
          false,
        );
        if (
          item &&
          [
            BillableItemStatus.RESERVED,
            BillableItemStatus.INVOICED,
            BillableItemStatus.ADJUSTED,
          ].includes(item.status)
        ) {
          throw new ConflictException(
            'Cette note contient une dépense déjà engagée dans la facturation et ne peut plus être supprimée',
          );
        }
      }
      await repository.delete({ id, tenant_id: tenantId });
    });
  }
}
