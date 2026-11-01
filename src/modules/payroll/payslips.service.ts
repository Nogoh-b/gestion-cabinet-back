import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
} from 'typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { User } from '../iam/user/entities/user.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { PayPayslipDto } from './dto/pay-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import {
  PayrollPeriod,
  PayrollPeriodStatus,
} from './entities/payroll-period.entity';
import { PayslipLine, PayslipLineType } from './entities/payslip-line.entity';
import { Payslip, PayslipStatus } from './entities/payslip.entity';
import {
  SalaryAdvance,
  SalaryAdvanceStatus,
} from './entities/salary-advance.entity';
import { PayrollCalculatorService } from './services/payroll-calculator.service';
import { PayrollGenerationService } from './services/payroll-generation.service';

export interface PayrollActor {
  userId?: number | null;
  role?: string | null;
}

@Injectable()
export class PayslipsService extends BaseServiceV1<Payslip> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Payslip)
    protected repository: Repository<Payslip>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepo: Repository<PayrollPeriod>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly planQuotaService: PlanQuotaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly generationService: PayrollGenerationService,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [],
      exactMatchFields: ['id', 'employee_id', 'period_id', 'status'],
      relationFields: ['employee', 'employee.user', 'period'],
    };
  }

  async create(
    dto: CreatePayslipDto,
    actor: PayrollActor,
  ): Promise<Payslip> {
    const tenantId = getCurrentTenantId();
    const user = await this.resolveActor(this.userRepo.manager, actor);
    await this.planQuotaService.checkModuleEnabled(tenantId, 'payroll');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let query = this.repository
      .createQueryBuilder('payslip')
      .where('payslip.created_at >= :start', { start: monthStart });
    query = addTenantCondition(query, 'payslip');
    await this.planQuotaService.checkLimit(
      tenantId,
      'payslips',
      await query.getCount(),
    );

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employee_id, tenant_id: tenantId },
    });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    const period = await this.periodRepo.findOne({
      where: { id: dto.period_id, tenant_id: tenantId },
    });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    this.assertPeriodDraft(period);

    const existing = await this.repository.findOne({
      where: {
        employee_id: employee.id,
        period_id: period.id,
        tenant_id: tenantId,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Un bulletin existe déjà pour ce collaborateur et cette période',
      );
    }

    const baseSalary = this.fromMinorUnits(
      this.toMinorUnits(dto.gross_amount),
    );
    const netAmount =
      dto.net_amount === undefined
        ? baseSalary
        : this.fromMinorUnits(this.toMinorUnits(dto.net_amount));
    const saved = await this.repository.save(
      this.repository.create({
        employee_id: employee.id,
        employee,
        period_id: period.id,
        period,
        gross_amount: baseSalary,
        net_amount: netAmount,
        notes: dto.notes?.trim() || null,
        status: PayslipStatus.DRAFT,
        prepared_by_id: user.id,
        prepared_by: user,
        validated_by_id: null,
        validated_at: null,
        paid_by_id: null,
        payment_date: null,
        payment_method: null,
        payment_reference: null,
        contribution_snapshot: null,
        tenant_id: tenantId,
      }),
    );

    if (baseSalary > 0) {
      await this.generationService.applyBaseSalaryLines(
        saved.id,
        baseSalary,
        period.label,
        undefined,
        period.end_date,
      );
    }
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId: user.id,
        action: 'payslip.prepared',
        resourceType: 'payslip',
        resourceId: saved.id,
        afterState: {
          status: PayslipStatus.DRAFT,
          employeeId: employee.id,
          periodId: period.id,
        },
      }),
    );
    return this.findOne(saved.id);
  }

  findAll(): Promise<Payslip[]> {
    return this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Payslip> {
    const payslip = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: [
        'employee',
        'employee.user',
        'period',
        'lines',
        'lines.dossier',
        'prepared_by',
        'validated_by',
        'paid_by',
      ],
    });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    return payslip;
  }

  async findOwn(actor: PayrollActor): Promise<Payslip[]> {
    const user = await this.resolveActor(this.userRepo.manager, actor);
    if (!user.employee?.id) {
      throw new ForbiddenException(
        'Aucun collaborateur n’est rattaché à cet utilisateur',
      );
    }
    const payslips = await this.repository.find({
      where: {
        employee_id: user.employee.id,
        status: PayslipStatus.PAID,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user', 'period', 'lines'],
      order: { payment_date: 'DESC', created_at: 'DESC' },
    });
    await this.auditSensitiveRead(
      user.id,
      'payslip.own_list_viewed',
      user.employee.id,
      { count: payslips.length },
    );
    return payslips;
  }

  async findOwnOne(
    id: number,
    actor: PayrollActor,
  ): Promise<Payslip> {
    const user = await this.resolveActor(this.userRepo.manager, actor);
    if (!user.employee?.id) {
      throw new ForbiddenException(
        'Aucun collaborateur n’est rattaché à cet utilisateur',
      );
    }
    const payslip = await this.repository.findOne({
      where: {
        id,
        employee_id: user.employee.id,
        status: PayslipStatus.PAID,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user', 'period', 'lines'],
    });
    if (!payslip) {
      throw new NotFoundException('Bulletin personnel non trouvé');
    }
    await this.auditSensitiveRead(
      user.id,
      'payslip.own_viewed',
      payslip.id,
      {
        employeeId: user.employee.id,
        periodId: payslip.period_id,
      },
    );
    return payslip;
  }

  findByPeriod(periodId: number): Promise<Payslip[]> {
    return this.repository.find({
      where: {
        period_id: periodId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  findByEmployee(employeeId: number): Promise<Payslip[]> {
    return this.repository.find({
      where: {
        employee_id: employeeId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async recomputeTotals(id: number): Promise<Payslip> {
    const payslip = await this.findOne(id);
    this.assertMutable(payslip);
    this.assertPeriodDraft(payslip.period);
    if (!payslip.lines?.length) return payslip;
    const totals = this.calculator.computeTotals(payslip.lines);
    payslip.gross_amount = this.fromMinorUnits(
      this.toMinorUnits(totals.gross_amount),
    );
    payslip.net_amount = this.fromMinorUnits(
      this.toMinorUnits(totals.net_amount),
    );
    return this.repository.save(payslip);
  }

  async validate(id: number, actor: PayrollActor): Promise<Payslip> {
    return this.dataSource.transaction(async (manager) => {
      const payslip = await this.lockPayslip(manager, id);
      if (payslip.status !== PayslipStatus.DRAFT) {
        throw new BadRequestException(
          'Seul un bulletin brouillon peut être validé',
        );
      }
      this.assertPeriodDraft(payslip.period);
      const user = await this.resolveActor(manager, actor);
      if (payslip.prepared_by_id === user.id) {
        throw new ForbiddenException(
          'Le préparateur ne peut pas valider son propre bulletin',
        );
      }
      if (payslip.lines?.length) {
        const totals = this.calculator.computeTotals(payslip.lines);
        payslip.gross_amount = this.fromMinorUnits(
          this.toMinorUnits(totals.gross_amount),
        );
        payslip.net_amount = this.fromMinorUnits(
          this.toMinorUnits(totals.net_amount),
        );
      }
      if (this.toMinorUnits(payslip.gross_amount) <= 0) {
        throw new BadRequestException(
          'Le salaire brut doit être strictement positif',
        );
      }
      payslip.status = PayslipStatus.VALIDATED;
      payslip.validated_by_id = user.id;
      payslip.validated_by = user;
      payslip.validated_at = new Date();
      payslip.snapshot = this.buildSnapshot(payslip);
      const saved = await manager.getRepository(Payslip).save(payslip);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payslip.validated',
        resourceType: 'payslip',
        resourceId: saved.id,
        beforeState: { status: PayslipStatus.DRAFT },
        afterState: {
          status: saved.status,
          validatedAt: saved.validated_at,
          grossAmount: Number(saved.gross_amount),
          netAmount: Number(saved.net_amount),
        },
      });
      return saved;
    });
  }

  async pay(
    id: number,
    dto: PayPayslipDto,
    actor: PayrollActor,
  ): Promise<Payslip> {
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    if (
      Number.isNaN(paymentDate.getTime()) ||
      paymentDate.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('Date de paiement invalide');
    }
    return this.dataSource.transaction(async (manager) => {
      const payslip = await this.lockPayslip(manager, id);
      if (payslip.status !== PayslipStatus.VALIDATED) {
        throw new BadRequestException(
          'Le bulletin doit être validé avant paiement',
        );
      }
      if (payslip.period.status !== PayrollPeriodStatus.VALIDATED) {
        throw new BadRequestException(
          'La période doit être clôturée avant le paiement',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (payslip.validated_by_id === user.id) {
        throw new ForbiddenException(
          'Le payeur doit être distinct du validateur',
        );
      }
      payslip.status = PayslipStatus.PAID;
      payslip.payment_date = paymentDate;
      payslip.payment_method = dto.paymentMethod;
      payslip.payment_reference = dto.paymentReference.trim();
      payslip.paid_by_id = user.id;
      payslip.paid_by = user;
      const saved = await manager.getRepository(Payslip).save(payslip);
      await this.realizeAdvanceRecovery(manager, saved);
      const audit = await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payslip.paid',
        resourceType: 'payslip',
        resourceId: saved.id,
        beforeState: { status: PayslipStatus.VALIDATED },
        afterState: {
          status: saved.status,
          paymentDate: saved.payment_date,
          paymentMethod: saved.payment_method,
          paymentReference: saved.payment_reference,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'payslip.paid',
        aggregateType: 'payslip',
        aggregateId: saved.id,
        idempotencyKey: `payslip-paid:${audit.id}`,
        payload: {
          payslipId: saved.id,
          employeeId: saved.employee_id,
          employeeName: saved.employee?.full_name ?? null,
          periodId: saved.period_id,
          periodLabel: saved.period?.label ?? null,
          grossAmount: Number(saved.gross_amount),
          netAmount: Number(saved.net_amount),
          totalEmployerCharges: Number(
            saved.total_employer_charges ?? 0,
          ),
          paymentDate: saved.payment_date,
          paymentMethod: saved.payment_method,
          paymentReference: saved.payment_reference,
          lines: (saved.lines ?? []).map((line) => ({
            lineType: line.line_type,
            label: line.label,
            amount: Number(line.amount),
          })),
        },
      });
      return saved;
    });
  }

  async revertToDraft(
    id: number,
    reason: string,
    actor: PayrollActor,
  ): Promise<Payslip> {
    return this.dataSource.transaction(async (manager) => {
      const payslip = await this.lockPayslip(manager, id);
      if (payslip.status !== PayslipStatus.VALIDATED) {
        throw new BadRequestException(
          'Seul un bulletin validé peut être corrigé',
        );
      }
      this.assertPeriodDraft(payslip.period);
      const user = await this.resolveActor(manager, actor);
      payslip.status = PayslipStatus.DRAFT;
      payslip.snapshot = null;
      payslip.validated_by_id = null;
      payslip.validated_by = null;
      payslip.validated_at = null;
      const saved = await manager.getRepository(Payslip).save(payslip);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payslip.validation_reverted',
        resourceType: 'payslip',
        resourceId: saved.id,
        beforeState: { status: PayslipStatus.VALIDATED },
        afterState: { status: PayslipStatus.DRAFT },
        justification: reason.trim(),
      });
      return saved;
    });
  }

  async update(id: number, dto: UpdatePayslipDto): Promise<Payslip> {
    const payslip = await this.findOne(id);
    this.assertMutable(payslip);
    this.assertPeriodDraft(payslip.period);
    if (dto.gross_amount !== undefined) {
      payslip.gross_amount = this.fromMinorUnits(
        this.toMinorUnits(dto.gross_amount),
      );
    }
    if (dto.net_amount !== undefined) {
      payslip.net_amount = this.fromMinorUnits(
        this.toMinorUnits(dto.net_amount),
      );
    }
    if (dto.notes !== undefined) payslip.notes = dto.notes.trim();
    return this.repository.save(payslip);
  }

  async remove(id: number, actor: PayrollActor): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const payslip = await this.lockPayslip(manager, id);
      this.assertMutable(payslip);
      this.assertPeriodDraft(payslip.period);
      const user = await this.resolveActor(manager, actor);
      await manager.getRepository(Payslip).softDelete(payslip.id);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payslip.deleted',
        resourceType: 'payslip',
        resourceId: payslip.id,
        beforeState: {
          status: payslip.status,
          employeeId: payslip.employee_id,
          periodId: payslip.period_id,
        },
      });
    });
  }

  private assertMutable(payslip: Payslip): void {
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw new ForbiddenException(
        'Seul un bulletin brouillon est modifiable',
      );
    }
  }

  private assertPeriodDraft(period: PayrollPeriod): void {
    if (period.status !== PayrollPeriodStatus.DRAFT) {
      throw new ForbiddenException(
        'Une période clôturée ou payée est strictement verrouillée',
      );
    }
  }

  private async lockPayslip(
    manager: EntityManager,
    id: number,
  ): Promise<Payslip> {
    const repository = manager.getRepository(Payslip);
    const locked = await repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new NotFoundException('Fiche de paie non trouvée');
    const payslip = await repository.findOne({
      where: { id: locked.id, tenant_id: getCurrentTenantId() },
      relations: ['employee', 'period', 'lines', 'lines.dossier'],
    });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    return payslip;
  }

  private async resolveActor(
    manager: EntityManager,
    actor: PayrollActor,
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

  private async auditSensitiveRead(
    actorId: number,
    action: string,
    resourceId: number,
    afterState: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId,
        action,
        resourceType: 'payslip',
        resourceId,
        afterState,
      }),
    );
  }

  private async realizeAdvanceRecovery(
    manager: EntityManager,
    payslip: Payslip,
  ): Promise<void> {
    const recovery = (payslip.lines ?? [])
      .filter(
        (line) =>
          line.line_type === PayslipLineType.ADVANCE_RECOVERY,
      )
      .reduce(
        (sum, line) => sum + Math.abs(this.toMinorUnits(line.amount)),
        0,
      );
    if (recovery <= 0) return;

    let remaining = recovery;
    const advances = await manager
      .getRepository(SalaryAdvance)
      .createQueryBuilder('advance')
      .where('advance.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('advance.employee_id = :employeeId', {
        employeeId: payslip.employee_id,
      })
      .andWhere('advance.status = :status', {
        status: SalaryAdvanceStatus.PAID,
      })
      .orderBy('advance.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    for (const advance of advances) {
      if (remaining <= 0) break;
      const outstanding =
        this.toMinorUnits(advance.amount) -
        this.toMinorUnits(advance.recovered_amount ?? 0);
      if (outstanding <= 0) continue;
      const applied = Math.min(outstanding, remaining);
      advance.recovered_amount = this.fromMinorUnits(
        this.toMinorUnits(advance.recovered_amount ?? 0) + applied,
      );
      if (
        this.toMinorUnits(advance.recovered_amount) >=
        this.toMinorUnits(advance.amount)
      ) {
        advance.status = SalaryAdvanceStatus.RECOVERED;
      }
      remaining -= applied;
      await manager.getRepository(SalaryAdvance).save(advance);
    }
  }

  private buildSnapshot(payslip: Payslip): Record<string, unknown> {
    return {
      frozen_at: new Date().toISOString(),
      gross_amount: Number(payslip.gross_amount),
      net_amount: Number(payslip.net_amount),
      total_employer_charges:
        payslip.total_employer_charges == null
          ? null
          : Number(payslip.total_employer_charges),
      contributions: payslip.contribution_snapshot ?? [],
      lines: (payslip.lines ?? []).map((line) => ({
        line_type: line.line_type,
        label: line.label,
        amount: Number(line.amount),
        is_taxable: line.is_taxable,
      })),
    };
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
