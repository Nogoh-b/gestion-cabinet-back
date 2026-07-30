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
import { User } from '../iam/user/entities/user.entity';
import { CreatePayrollContributionDto } from './dto/create-payroll-contribution.dto';
import { RetirePayrollContributionDto } from './dto/retire-payroll-contribution.dto';
import { UpdatePayrollContributionDto } from './dto/update-payroll-contribution.dto';
import {
  ContributionBase,
  ContributionPayer,
  PayrollContribution,
  PayrollContributionStatus,
} from './entities/payroll-contribution.entity';
import type { PayrollActor } from './payslips.service';

const DEFAULT_CONTRIBUTIONS: Array<
  Omit<
    CreatePayrollContributionDto,
    'valid_from'
  >
> = [
  {
    code: 'CNPS_PVID_SAL',
    label: 'CNPS - Pension vieillesse (part salariale)',
    rate: 4.2,
    base_type: ContributionBase.GROSS,
    payer: ContributionPayer.EMPLOYEE,
    ceiling: 750000,
    account_number: '431',
    sort_order: 10,
  },
  {
    code: 'CNPS_PVID_PAT',
    label: 'CNPS - Pension vieillesse (part patronale)',
    rate: 4.2,
    base_type: ContributionBase.GROSS,
    payer: ContributionPayer.EMPLOYER,
    ceiling: 750000,
    account_number: '431',
    sort_order: 20,
  },
  {
    code: 'CNPS_PF',
    label: 'CNPS - Prestations familiales (part patronale)',
    rate: 7,
    base_type: ContributionBase.GROSS,
    payer: ContributionPayer.EMPLOYER,
    ceiling: 750000,
    account_number: '431',
    sort_order: 30,
  },
  {
    code: 'CNPS_AT',
    label: 'CNPS - Accidents du travail (part patronale)',
    rate: 1.75,
    base_type: ContributionBase.GROSS,
    payer: ContributionPayer.EMPLOYER,
    account_number: '431',
    sort_order: 40,
  },
  {
    code: 'CFC_SAL',
    label: 'Crédit Foncier (part salariale)',
    rate: 1,
    base_type: ContributionBase.TAXABLE,
    payer: ContributionPayer.EMPLOYEE,
    account_number: '447',
    sort_order: 50,
  },
  {
    code: 'RAV',
    label: 'Redevance audiovisuelle',
    rate: 0,
    base_type: ContributionBase.FIXED,
    payer: ContributionPayer.EMPLOYEE,
    account_number: '447',
    sort_order: 60,
  },
];

@Injectable()
export class PayrollContributionsService {
  constructor(
    @InjectRepository(PayrollContribution)
    private readonly repository: Repository<PayrollContribution>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreatePayrollContributionDto,
    actor: PayrollActor,
  ): Promise<PayrollContribution> {
    const tenantId = getCurrentTenantId();
    const user = await this.resolveActor(
      this.userRepository.manager,
      actor,
    );
    const validFrom = this.parseDate(
      dto.valid_from,
      'Date de prise d’effet invalide',
    );
    const code = dto.code.trim().toUpperCase();
    const raw = await this.repository
      .createQueryBuilder('contribution')
      .select('MAX(contribution.version)', 'maxVersion')
      .where('contribution.tenant_id = :tenantId', { tenantId })
      .andWhere('contribution.code = :code', { code })
      .getRawOne<{ maxVersion: string | null }>();
    const version = Number(raw?.maxVersion ?? 0) + 1;
    const saved = await this.repository.save(
      this.repository.create({
        ...dto,
        code,
        label: dto.label.trim(),
        version,
        valid_from: validFrom,
        valid_until: null,
        status: PayrollContributionStatus.DRAFT,
        is_active: false,
        published_at: null,
        published_by_id: null,
        retired_at: null,
        retired_by_id: null,
        retirement_reason: null,
        tenant_id: tenantId,
      }),
    );
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_contribution.draft_created',
        resourceType: 'payroll_contribution',
        resourceId: saved.id,
        afterState: {
          code: saved.code,
          version: saved.version,
          validFrom: saved.valid_from,
          status: saved.status,
        },
      }),
    );
    return saved;
  }

  findAll(): Promise<PayrollContribution[]> {
    return this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: ['published_by', 'retired_by'],
      order: { code: 'ASC', version: 'DESC' },
    });
  }

  async findApplicable(
    effectiveAt: Date,
  ): Promise<PayrollContribution[]> {
    return this.repository
      .createQueryBuilder('contribution')
      .where('contribution.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('contribution.status = :status', {
        status: PayrollContributionStatus.PUBLISHED,
      })
      .andWhere('contribution.valid_from <= :effectiveAt', {
        effectiveAt,
      })
      .andWhere(
        '(contribution.valid_until IS NULL OR contribution.valid_until >= :effectiveAt)',
        { effectiveAt },
      )
      .orderBy('contribution.sort_order', 'ASC')
      .addOrderBy('contribution.code', 'ASC')
      .getMany();
  }

  async findOne(id: number): Promise<PayrollContribution> {
    const contribution = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: ['published_by', 'retired_by'],
    });
    if (!contribution) {
      throw new NotFoundException('Cotisation non trouvée');
    }
    return contribution;
  }

  async update(
    id: number,
    dto: UpdatePayrollContributionDto,
  ): Promise<PayrollContribution> {
    const item = await this.findOne(id);
    this.assertDraft(item);
    if (dto.valid_from) {
      item.valid_from = this.parseDate(
        dto.valid_from,
        'Date de prise d’effet invalide',
      );
    }
    if (dto.label !== undefined) item.label = dto.label.trim();
    if (dto.rate !== undefined) item.rate = dto.rate;
    if (dto.base_type !== undefined) item.base_type = dto.base_type;
    if (dto.payer !== undefined) item.payer = dto.payer;
    if (dto.ceiling !== undefined) item.ceiling = dto.ceiling;
    if (dto.account_number !== undefined) {
      item.account_number = dto.account_number.trim();
    }
    if (dto.sort_order !== undefined) item.sort_order = dto.sort_order;
    return this.repository.save(item);
  }

  async publish(
    id: number,
    actor: PayrollActor,
  ): Promise<PayrollContribution> {
    return this.dataSource.transaction(async (manager) => {
      const item = await this.lockContribution(manager, id);
      this.assertDraft(item);
      const user = await this.resolveActor(manager, actor);
      const current = await manager
        .getRepository(PayrollContribution)
        .createQueryBuilder('contribution')
        .where('contribution.tenant_id = :tenantId', {
          tenantId: getCurrentTenantId(),
        })
        .andWhere('contribution.code = :code', { code: item.code })
        .andWhere('contribution.status = :status', {
          status: PayrollContributionStatus.PUBLISHED,
        })
        .setLock('pessimistic_write')
        .getOne();
      if (current) {
        if (
          new Date(current.valid_from).getTime() >=
          new Date(item.valid_from).getTime()
        ) {
          throw new BadRequestException(
            'La nouvelle version doit prendre effet après la version publiée',
          );
        }
        const dayBefore = new Date(item.valid_from);
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        current.status = PayrollContributionStatus.RETIRED;
        current.is_active = false;
        current.valid_until = dayBefore;
        current.retired_at = new Date();
        current.retired_by_id = user.id;
        current.retired_by = user;
        current.retirement_reason =
          `Remplacée par ${item.code} v${item.version}`;
        await manager
          .getRepository(PayrollContribution)
          .save(current);
      }
      item.status = PayrollContributionStatus.PUBLISHED;
      item.is_active = true;
      item.published_at = new Date();
      item.published_by_id = user.id;
      item.published_by = user;
      const saved = await manager
        .getRepository(PayrollContribution)
        .save(item);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_contribution.published',
        resourceType: 'payroll_contribution',
        resourceId: saved.id,
        beforeState: {
          status: PayrollContributionStatus.DRAFT,
        },
        afterState: {
          status: saved.status,
          code: saved.code,
          version: saved.version,
          rate: Number(saved.rate),
          validFrom: saved.valid_from,
        },
      });
      return saved;
    });
  }

  async retire(
    id: number,
    dto: RetirePayrollContributionDto,
    actor: PayrollActor,
  ): Promise<PayrollContribution> {
    return this.dataSource.transaction(async (manager) => {
      const item = await this.lockContribution(manager, id);
      if (item.status !== PayrollContributionStatus.PUBLISHED) {
        throw new BadRequestException(
          'Seule une version publiée peut être retirée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      const validUntil = dto.validUntil
        ? this.parseDate(dto.validUntil, 'Date de fin invalide')
        : new Date();
      if (
        validUntil.getTime() <
        new Date(item.valid_from).getTime()
      ) {
        throw new BadRequestException(
          'La date de fin précède la prise d’effet',
        );
      }
      item.status = PayrollContributionStatus.RETIRED;
      item.is_active = false;
      item.valid_until = validUntil;
      item.retired_at = new Date();
      item.retired_by_id = user.id;
      item.retired_by = user;
      item.retirement_reason = dto.reason.trim();
      const saved = await manager
        .getRepository(PayrollContribution)
        .save(item);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_contribution.retired',
        resourceType: 'payroll_contribution',
        resourceId: saved.id,
        beforeState: {
          status: PayrollContributionStatus.PUBLISHED,
        },
        afterState: {
          status: saved.status,
          validUntil: saved.valid_until,
        },
        justification: saved.retirement_reason,
      });
      return saved;
    });
  }

  async remove(id: number, actor: PayrollActor): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const item = await this.lockContribution(manager, id);
      this.assertDraft(item);
      const user = await this.resolveActor(manager, actor);
      await manager
        .getRepository(PayrollContribution)
        .softDelete(item.id);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'payroll_contribution.draft_deleted',
        resourceType: 'payroll_contribution',
        resourceId: item.id,
        beforeState: {
          code: item.code,
          version: item.version,
          status: item.status,
        },
      });
    });
  }

  async seedDefaults(
    actor: PayrollActor,
  ): Promise<{ created: number; status: PayrollContributionStatus }> {
    const existing = await this.repository.count({
      where: { tenant_id: getCurrentTenantId() },
    });
    if (existing > 0) {
      return {
        created: 0,
        status: PayrollContributionStatus.DRAFT,
      };
    }
    const validFrom = `${new Date().getUTCFullYear()}-01-01`;
    for (const contribution of DEFAULT_CONTRIBUTIONS) {
      await this.create(
        { ...contribution, valid_from: validFrom },
        actor,
      );
    }
    return {
      created: DEFAULT_CONTRIBUTIONS.length,
      status: PayrollContributionStatus.DRAFT,
    };
  }

  private assertDraft(item: PayrollContribution): void {
    if (item.status !== PayrollContributionStatus.DRAFT) {
      throw new ForbiddenException(
        'Une version publiée ou retirée est immuable',
      );
    }
  }

  private async lockContribution(
    manager: EntityManager,
    id: number,
  ): Promise<PayrollContribution> {
    const item = await manager
      .getRepository(PayrollContribution)
      .findOne({
        where: { id, tenant_id: getCurrentTenantId() },
        lock: { mode: 'pessimistic_write' },
      });
    if (!item) throw new NotFoundException('Cotisation non trouvée');
    return item;
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

  private parseDate(value: string, message: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(message);
    }
    return parsed;
  }
}
