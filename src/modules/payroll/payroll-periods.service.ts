import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Branch } from '../agencies/branch/entities/branch.entity';
import { User } from '../iam/user/entities/user.entity';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto';
import {
  PayrollPeriod,
  PayrollPeriodStatus,
} from './entities/payroll-period.entity';
import { Payslip, PayslipStatus } from './entities/payslip.entity';
import type { PayrollActor } from './payslips.service';

export interface ClosePeriodResult {
  period_id: number;
  status: PayrollPeriodStatus;
  payslips_count: number;
}

@Injectable()
export class PayrollPeriodsService extends BaseServiceV1<PayrollPeriod> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(PayrollPeriod)
    protected repository: Repository<PayrollPeriod>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreatePayrollPeriodDto): Promise<PayrollPeriod> {
    const tenantId = getCurrentTenantId();
    const start = this.parseDate(dto.start_date, 'Date de début invalide');
    const end = this.parseDate(dto.end_date, 'Date de fin invalide');
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'La date de début doit précéder la date de fin',
      );
    }
    const branch = dto.branch_id
      ? await this.branchRepo.findOne({
          where: { id: dto.branch_id, tenant_id: tenantId },
        })
      : null;
    if (dto.branch_id && !branch) {
      throw new NotFoundException('Agence non trouvée');
    }
    await this.assertNoOverlap(start, end, branch?.id ?? null);
    return this.repository.save(
      this.repository.create({
        label: dto.label.trim(),
        start_date: start,
        end_date: end,
        branch_id: branch?.id ?? null,
        branch,
        status: PayrollPeriodStatus.DRAFT,
        closed_at: null,
        closed_by_id: null,
        paid_at: null,
        paid_by_id: null,
        tenant_id: tenantId,
      }),
    );
  }

  findAll(): Promise<PayrollPeriod[]> {
    return this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: ['branch', 'payslips'],
      order: { start_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<PayrollPeriod> {
    const period = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: [
        'branch',
        'payslips',
        'payslips.employee',
        'payslips.lines',
        'closed_by',
        'paid_by',
      ],
    });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    return period;
  }

  async update(
    id: number,
    dto: UpdatePayrollPeriodDto,
  ): Promise<PayrollPeriod> {
    const period = await this.findOne(id);
    this.assertDraft(period);
    const start = dto.start_date
      ? this.parseDate(dto.start_date, 'Date de début invalide')
      : new Date(period.start_date);
    const end = dto.end_date
      ? this.parseDate(dto.end_date, 'Date de fin invalide')
      : new Date(period.end_date);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'La date de début doit précéder la date de fin',
      );
    }
    let branch = period.branch ?? null;
    if (
      dto.branch_id !== undefined &&
      dto.branch_id !== period.branch_id
    ) {
      branch = await this.branchRepo.findOne({
        where: {
          id: dto.branch_id,
          tenant_id: getCurrentTenantId(),
        },
      });
      if (!branch) throw new NotFoundException('Agence non trouvée');
    }
    await this.assertNoOverlap(
      start,
      end,
      branch?.id ?? null,
      period.id,
    );
    period.label = dto.label?.trim() ?? period.label;
    period.start_date = start;
    period.end_date = end;
    period.branch = branch;
    period.branch_id = branch?.id ?? null;
    return this.repository.save(period);
  }

  async close(
    id: number,
    actor: PayrollActor,
  ): Promise<ClosePeriodResult> {
    return this.dataSource.transaction(async (manager) => {
      const period = await this.lockPeriod(manager, id);
      this.assertDraft(period);
      const user = await this.resolveActor(manager, actor);
      const payslips = period.payslips ?? [];
      if (!payslips.length) {
        throw new BadRequestException(
          'Une période vide ne peut pas être clôturée',
        );
      }
      const drafts = payslips.filter(
        (payslip) => payslip.status === PayslipStatus.DRAFT,
      );
      if (drafts.length) {
        throw new BadRequestException(
          `${drafts.length} bulletin(s) restent à valider`,
        );
      }
      period.status = PayrollPeriodStatus.VALIDATED;
      period.closed_at = new Date();
      period.closed_by_id = user.id;
      period.closed_by = user;
      const saved = await manager
        .getRepository(PayrollPeriod)
        .save(period);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_period.closed',
        resourceType: 'payroll_period',
        resourceId: saved.id,
        beforeState: { status: PayrollPeriodStatus.DRAFT },
        afterState: {
          status: saved.status,
          closedAt: saved.closed_at,
          payslipsCount: payslips.length,
        },
      });
      return {
        period_id: saved.id,
        status: saved.status,
        payslips_count: payslips.length,
      };
    });
  }

  async markPaid(
    id: number,
    actor: PayrollActor,
  ): Promise<ClosePeriodResult> {
    return this.dataSource.transaction(async (manager) => {
      const period = await this.lockPeriod(manager, id);
      if (period.status !== PayrollPeriodStatus.VALIDATED) {
        throw new BadRequestException(
          'Seule une période clôturée peut être marquée payée',
        );
      }
      const payslips = period.payslips ?? [];
      if (
        !payslips.length ||
        payslips.some(
          (payslip) => payslip.status !== PayslipStatus.PAID,
        )
      ) {
        throw new BadRequestException(
          'Tous les bulletins doivent être payés',
        );
      }
      const user = await this.resolveActor(manager, actor);
      period.status = PayrollPeriodStatus.PAID;
      period.paid_at = new Date();
      period.paid_by_id = user.id;
      period.paid_by = user;
      const saved = await manager
        .getRepository(PayrollPeriod)
        .save(period);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_period.paid',
        resourceType: 'payroll_period',
        resourceId: saved.id,
        beforeState: { status: PayrollPeriodStatus.VALIDATED },
        afterState: {
          status: saved.status,
          paidAt: saved.paid_at,
          payslipsCount: payslips.length,
        },
      });
      return {
        period_id: saved.id,
        status: saved.status,
        payslips_count: payslips.length,
      };
    });
  }

  async remove(id: number, actor: PayrollActor): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const period = await this.lockPeriod(manager, id);
      this.assertDraft(period);
      if (period.payslips?.length) {
        throw new BadRequestException(
          'Une période contenant des bulletins ne peut pas être supprimée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      await manager.getRepository(PayrollPeriod).softDelete(period.id);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_period.deleted',
        resourceType: 'payroll_period',
        resourceId: period.id,
        beforeState: {
          status: period.status,
          startDate: period.start_date,
          endDate: period.end_date,
        },
      });
    });
  }

  private assertDraft(period: PayrollPeriod): void {
    if (period.status !== PayrollPeriodStatus.DRAFT) {
      throw new ForbiddenException(
        'Une période clôturée ou payée est strictement verrouillée',
      );
    }
  }

  private async lockPeriod(
    manager: EntityManager,
    id: number,
  ): Promise<PayrollPeriod> {
    const repository = manager.getRepository(PayrollPeriod);
    const locked = await repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new NotFoundException('Période de paie non trouvée');
    const period = await repository.findOne({
      where: { id: locked.id, tenant_id: getCurrentTenantId() },
      relations: ['payslips'],
    });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    return period;
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
    });
    if (!user) throw new ForbiddenException('Utilisateur introuvable');
    return user;
  }

  private async assertNoOverlap(
    start: Date,
    end: Date,
    branchId: number | null,
    excludedId?: number,
  ): Promise<void> {
    let query = this.repository
      .createQueryBuilder('period')
      .where('period.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('period.start_date <= :end', { end })
      .andWhere('period.end_date >= :start', { start });
    query =
      branchId == null
        ? query.andWhere('period.branch_id IS NULL')
        : query.andWhere('period.branch_id = :branchId', { branchId });
    if (excludedId) {
      query = query.andWhere('period.id <> :excludedId', {
        excludedId,
      });
    }
    if (await query.getExists()) {
      throw new BadRequestException(
        'Une période de paie chevauche déjà cet intervalle',
      );
    }
  }

  private parseDate(value: Date, message: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(message);
    }
    return parsed;
  }
}
