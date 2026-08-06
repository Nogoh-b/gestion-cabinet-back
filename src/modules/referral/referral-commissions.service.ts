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
  FindOptionsOrder,
  Repository,
} from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import {
  PaginatedResult,
  PaginationServiceV1,
} from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchCriteria,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import { Facture } from '../facture/entities/facture.entity';
import { StatutFacture } from '../facture/dto/create-facture.dto';
import { Paiement } from '../paiement/entities/paiement.entity';
import { StatutPaiement } from '../paiement/dto/create-paiement.dto';
import { CancelReferralCommissionDto } from './dto/cancel-referral-commission.dto';
import { CreateReferralCommissionDto } from './dto/create-referral-commission.dto';
import { PayReferralCommissionDto } from './dto/pay-referral-commission.dto';
import { UpdateReferralCommissionDto } from './dto/update-referral-commission.dto';
import {
  CommissionBasis,
  CommissionMode,
  DossierReferral,
} from './entities/dossier-referral.entity';
import {
  CommissionStatus,
  ReferralCommission,
} from './entities/referral-commission.entity';
import { Referrer } from './entities/referral.entity';

export interface ReferralCommissionActor {
  userId?: number;
  id?: number;
  role?: string;
}

interface ResolvedCommissionSources {
  referral: DossierReferral;
  facture: Facture | null;
  paiement: Paiement | null;
}

const COMMISSION_RELATIONS = [
  'dossier_referral',
  'dossier_referral.dossier',
  'dossier_referral.referrer',
  'dossier_referral.referrer.employee',
  'dossier_referral.referrer.employee.user',
  'dossier_referral.referrer.customer',
  'facture',
  'paiement',
];

@Injectable()
export class ReferralCommissionsService extends BaseServiceV1<ReferralCommission> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(ReferralCommission)
    protected repository: Repository<ReferralCommission>,
    @InjectRepository(DossierReferral)
    private readonly dossierReferralRepo: Repository<DossierReferral>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [
        'dossier_referral.dossier.dossier_number',
        'dossier_referral.referrer.company_name',
        'dossier_referral.referrer.contact_name',
        'facture.numero',
        'payment_reference',
      ],
      exactMatchFields: [
        'id',
        'tenant_id',
        'dossier_referral_id',
        'facture_id',
        'paiement_id',
        'status',
      ],
      dateRangeFields: [
        'created_at',
        'updated_at',
        'calculation_date',
        'payment_date',
      ],
      relationFields: COMMISSION_RELATIONS,
    };
  }

  async create(
    dto: CreateReferralCommissionDto,
    actor: ReferralCommissionActor,
  ): Promise<ReferralCommission> {
    const id = await this.dataSource.transaction(async (manager) => {
      const user = await this.resolveActor(manager, actor);
      const sources = await this.resolveSources(
        manager,
        dto.dossier_referral_id,
        dto.facture_id,
        dto.paiement_id,
      );
      this.assertSourceRequired(sources);
      const calculationDate = this.parsePastDate(
        dto.calculation_date,
        'Date de calcul invalide',
      );
      const amount = this.fromMinorUnits(this.toMinorUnits(dto.amount));
      const repository = manager.getRepository(ReferralCommission);
      const saved = await repository.save(
        repository.create({
          tenant_id: getCurrentTenantId(),
          dossier_referral_id: sources.referral.id,
          dossier_referral: sources.referral,
          facture_id: sources.facture?.id ?? null,
          facture: sources.facture,
          paiement_id: sources.paiement?.id ?? null,
          paiement: sources.paiement,
          amount,
          status: CommissionStatus.CALCULATED,
          calculation_date: calculationDate,
          payment_date: null,
          payment_method: null,
          payment_reference: null,
          notes: dto.notes?.trim() || null,
          calculated_by_id: user.id,
          calculated_by: user,
          approved_by_id: null,
          approved_at: null,
          paid_by_id: null,
          cancelled_by_id: null,
          cancelled_at: null,
          cancellation_reason: null,
        }),
      );
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'referral_commission.calculated',
        resourceType: 'referral_commission',
        resourceId: saved.id,
        dossierId: sources.referral.dossier_id,
        afterState: this.auditState(saved),
      });
      return saved.id;
    });
    return this.findOne(id);
  }

  async searchWithTransformer<R>(
    criteria: SearchCriteria,
    dtoClass: new (...args: any[]) => R,
    paginationParams?: PaginationParamsDto,
    relations?: string[] | null,
    order?: FindOptionsOrder<ReferralCommission>,
  ): Promise<PaginatedResult<R>> {
    const result = await super.searchWithTransformer(
      {
        ...(criteria ?? {}),
        tenant_id: getCurrentTenantId(),
      },
      dtoClass,
      paginationParams,
      relations,
      order,
    );
    return {
      ...result,
      data: result.data.map((item: any) =>
        this.enrichCommission(item as ReferralCommission),
      ) as R[],
    };
  }

  async findAll(): Promise<ReferralCommission[]> {
    const items = await this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: COMMISSION_RELATIONS,
      order: { calculation_date: 'DESC' },
    });
    return items.map((item) => this.enrichCommission(item));
  }

  async findOne(id: number): Promise<ReferralCommission> {
    const commission = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: [
        ...COMMISSION_RELATIONS,
        'calculated_by',
        'approved_by',
        'paid_by',
        'cancelled_by',
      ],
    });
    if (!commission) {
      throw new NotFoundException('Commission non trouvée');
    }
    return this.enrichCommission(commission);
  }

  async findByReferral(
    dossierReferralId: number,
  ): Promise<ReferralCommission[]> {
    const items = await this.repository.find({
      where: {
        dossier_referral_id: dossierReferralId,
        tenant_id: getCurrentTenantId(),
      },
      relations: COMMISSION_RELATIONS,
      order: { calculation_date: 'DESC' },
    });
    return items.map((item) => this.enrichCommission(item));
  }

  async findByReferrer(
    referrerId: number,
  ): Promise<ReferralCommission[]> {
    const items = await this.repository.find({
      where: {
        tenant_id: getCurrentTenantId(),
        dossier_referral: {
          referrer_id: referrerId,
          tenant_id: getCurrentTenantId(),
        },
      },
      relations: COMMISSION_RELATIONS,
      order: { calculation_date: 'DESC' },
    });
    return items.map((item) => this.enrichCommission(item));
  }

  async approve(
    id: number,
    actor: ReferralCommissionActor,
  ): Promise<ReferralCommission> {
    await this.dataSource.transaction(async (manager) => {
      const commission = await this.lockCommission(manager, id);
      if (commission.status !== CommissionStatus.CALCULATED) {
        throw new BadRequestException(
          'Seule une commission calculée peut être approuvée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (commission.calculated_by_id === user.id) {
        throw new ForbiddenException(
          'Le calculateur ne peut pas approuver sa propre commission',
        );
      }
      commission.status = CommissionStatus.APPROVED;
      commission.approved_by_id = user.id;
      commission.approved_by = user;
      commission.approved_at = new Date();
      const saved = await manager
        .getRepository(ReferralCommission)
        .save(commission);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'referral_commission.approved',
        resourceType: 'referral_commission',
        resourceId: saved.id,
        dossierId: saved.dossier_referral.dossier_id,
        beforeState: { status: CommissionStatus.CALCULATED },
        afterState: this.auditState(saved),
      });
    });
    return this.findOne(id);
  }

  async pay(
    id: number,
    dto: PayReferralCommissionDto,
    actor: ReferralCommissionActor,
  ): Promise<ReferralCommission> {
    const paymentDate = dto.paymentDate
      ? this.parsePastDate(dto.paymentDate, 'Date de paiement invalide')
      : new Date();
    await this.dataSource.transaction(async (manager) => {
      const commission = await this.lockCommission(manager, id);
      if (commission.status !== CommissionStatus.APPROVED) {
        throw new BadRequestException(
          'La commission doit être approuvée avant paiement',
        );
      }
      const user = await this.resolveActor(manager, actor);
      if (commission.approved_by_id === user.id) {
        throw new ForbiddenException(
          "Le payeur doit être distinct de l'approbateur",
        );
      }
      commission.status = CommissionStatus.PAID;
      commission.payment_date = paymentDate;
      commission.payment_method = dto.paymentMethod;
      commission.payment_reference = dto.paymentReference.trim();
      commission.paid_by_id = user.id;
      commission.paid_by = user;
      const saved = await manager
        .getRepository(ReferralCommission)
        .save(commission);
      const audit = await this.auditService.append(manager, {
        actorId: user.id,
        action: 'referral_commission.paid',
        resourceType: 'referral_commission',
        resourceId: saved.id,
        dossierId: saved.dossier_referral.dossier_id,
        beforeState: { status: CommissionStatus.APPROVED },
        afterState: this.auditState(saved),
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'referral_commission.paid',
        aggregateType: 'referral_commission',
        aggregateId: saved.id,
        idempotencyKey: `referral-commission-paid:${audit.id}`,
        payload: {
          commissionId: saved.id,
          dossierId: saved.dossier_referral.dossier_id,
          dossierReferralId: saved.dossier_referral_id,
          referrerName: this.getReferrerDisplayName(
            saved.dossier_referral.referrer,
          ),
          invoiceId: saved.facture_id,
          sourcePaymentId: saved.paiement_id,
          amount: Number(saved.amount),
          paymentDate: saved.payment_date,
          paymentMethod: saved.payment_method,
          paymentReference: saved.payment_reference,
        },
      });
    });
    return this.findOne(id);
  }

  async cancel(
    id: number,
    dto: CancelReferralCommissionDto,
    actor: ReferralCommissionActor,
  ): Promise<ReferralCommission> {
    await this.dataSource.transaction(async (manager) => {
      const commission = await this.lockCommission(manager, id);
      if (
        ![
          CommissionStatus.CALCULATED,
          CommissionStatus.APPROVED,
        ].includes(commission.status)
      ) {
        throw new ForbiddenException(
          'Une commission payée ou annulée ne peut pas être annulée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      const previousStatus = commission.status;
      commission.status = CommissionStatus.CANCELLED;
      commission.cancelled_by_id = user.id;
      commission.cancelled_by = user;
      commission.cancelled_at = new Date();
      commission.cancellation_reason = dto.reason.trim();
      const saved = await manager
        .getRepository(ReferralCommission)
        .save(commission);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'referral_commission.cancelled',
        resourceType: 'referral_commission',
        resourceId: saved.id,
        dossierId: saved.dossier_referral.dossier_id,
        beforeState: { status: previousStatus },
        afterState: this.auditState(saved),
        justification: saved.cancellation_reason,
      });
    });
    return this.findOne(id);
  }

  async update(
    id: number,
    dto: UpdateReferralCommissionDto,
    actor: ReferralCommissionActor,
  ): Promise<ReferralCommission> {
    await this.dataSource.transaction(async (manager) => {
      const commission = await this.lockCommission(manager, id);
      if (commission.status !== CommissionStatus.CALCULATED) {
        throw new ForbiddenException(
          'Une commission approuvée, payée ou annulée est immuable',
        );
      }
      const user = await this.resolveActor(manager, actor);
      const beforeState = this.auditState(commission);
      const sources = await this.resolveSources(
        manager,
        commission.dossier_referral_id,
        dto.facture_id === undefined
          ? commission.facture_id
          : dto.facture_id,
        dto.paiement_id === undefined
          ? commission.paiement_id
          : dto.paiement_id,
      );
      this.assertSourceRequired(sources);
      commission.facture_id = sources.facture?.id ?? null;
      commission.facture = sources.facture;
      commission.paiement_id = sources.paiement?.id ?? null;
      commission.paiement = sources.paiement;
      if (dto.amount !== undefined) {
        commission.amount = this.fromMinorUnits(
          this.toMinorUnits(dto.amount),
        );
      }
      if (dto.calculation_date !== undefined) {
        commission.calculation_date = this.parsePastDate(
          dto.calculation_date,
          'Date de calcul invalide',
        );
      }
      if (dto.notes !== undefined) {
        commission.notes = dto.notes.trim() || null;
      }
      const saved = await manager
        .getRepository(ReferralCommission)
        .save(commission);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'referral_commission.updated',
        resourceType: 'referral_commission',
        resourceId: saved.id,
        dossierId: saved.dossier_referral.dossier_id,
        beforeState,
        afterState: this.auditState(saved),
      });
    });
    return this.findOne(id);
  }

  async remove(
    id: number,
    actor: ReferralCommissionActor,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const commission = await this.lockCommission(manager, id);
      if (commission.status !== CommissionStatus.CALCULATED) {
        throw new ForbiddenException(
          'Seule une commission calculée peut être supprimée',
        );
      }
      const user = await this.resolveActor(manager, actor);
      await manager.getRepository(ReferralCommission).softDelete(id);
      await this.auditService.append(manager, {
        actorId: user.id,
        action: 'referral_commission.deleted',
        resourceType: 'referral_commission',
        resourceId: commission.id,
        dossierId: commission.dossier_referral.dossier_id,
        beforeState: this.auditState(commission),
      });
    });
  }

  async calculateFromInvoiceEvent(
    payload: Record<string, any>,
  ): Promise<ReferralCommission | null> {
    const invoiceId = String(payload.invoiceId ?? payload.id ?? '');
    const dossierId = Number(
      payload.dossierId ?? payload.dossier_id,
    );
    if (!invoiceId || !Number.isInteger(dossierId) || dossierId <= 0) {
      throw new BadRequestException(
        "Événement de facture incomplet pour le calcul de commission",
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const sources = await this.lockReferralByDossier(
        manager,
        dossierId,
      );
      if (!sources) return null;
      if (
        ![
          CommissionBasis.INVOICED_HT,
          CommissionBasis.INVOICED_TTC,
        ].includes(sources.commission_basis)
      ) {
        return null;
      }
      const facture = await manager.getRepository(Facture).findOne({
        where: {
          id: invoiceId,
          dossier_id: dossierId,
          tenant_id: getCurrentTenantId(),
        },
      });
      if (!facture) {
        throw new NotFoundException(
          'Facture source de la commission introuvable',
        );
      }
      const existing = await manager
        .getRepository(ReferralCommission)
        .findOne({
          where: {
            tenant_id: getCurrentTenantId(),
            dossier_referral_id: sources.id,
            facture_id: invoiceId,
          },
        });
      if (existing) return existing;
      if (await this.fixedCommissionExists(manager, sources)) {
        return null;
      }
      const base =
        sources.commission_basis === CommissionBasis.INVOICED_HT
          ? Number(payload.montantHT ?? facture.montantHT)
          : Number(payload.montantTTC ?? facture.montantTTC);
      return this.saveAutomaticallyCalculated(
        manager,
        sources,
        facture,
        null,
        base,
        'invoice',
      );
    });
  }

  async calculateFromPaymentEvent(
    payload: Record<string, any>,
  ): Promise<ReferralCommission | null> {
    const paymentId = String(
      payload.paymentId ?? payload.id ?? '',
    );
    const invoiceId = String(
      payload.invoiceId ?? payload.facture?.id ?? '',
    );
    const dossierId = Number(
      payload.dossierId ??
        payload.facture?.dossier_id ??
        payload.facture?.dossierId,
    );
    if (
      !paymentId ||
      !invoiceId ||
      !Number.isInteger(dossierId) ||
      dossierId <= 0
    ) {
      throw new BadRequestException(
        "Événement de paiement incomplet pour le calcul de commission",
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const referral = await this.lockReferralByDossier(
        manager,
        dossierId,
      );
      if (!referral) return null;
      if (
        ![
          CommissionBasis.COLLECTED_HT,
          CommissionBasis.COLLECTED_TTC,
        ].includes(referral.commission_basis)
      ) {
        return null;
      }
      const paiement = await manager.getRepository(Paiement).findOne({
        where: {
          id: paymentId,
          factureId: invoiceId,
          tenant_id: getCurrentTenantId(),
          status: StatutPaiement.VALIDE,
        },
        relations: ['facture'],
      });
      if (
        !paiement ||
        paiement.facture?.dossier_id !== dossierId
      ) {
        throw new NotFoundException(
          'Paiement source validé de la commission introuvable',
        );
      }
      const existing = await manager
        .getRepository(ReferralCommission)
        .findOne({
          where: {
            tenant_id: getCurrentTenantId(),
            paiement_id: paymentId,
          },
        });
      if (existing) return existing;
      if (await this.fixedCommissionExists(manager, referral)) {
        return null;
      }
      let base = Number(payload.amount ?? paiement.montant);
      if (referral.commission_basis === CommissionBasis.COLLECTED_HT) {
        const taxRate = Number(paiement.facture?.tauxTVA ?? 0);
        base =
          taxRate > 0 ? base / (1 + taxRate / 100) : base;
      }
      return this.saveAutomaticallyCalculated(
        manager,
        referral,
        paiement.facture,
        paiement,
        base,
        'payment',
      );
    });
  }

  private async saveAutomaticallyCalculated(
    manager: EntityManager,
    referral: DossierReferral,
    facture: Facture,
    paiement: Paiement | null,
    base: number,
    source: 'invoice' | 'payment',
  ): Promise<ReferralCommission | null> {
    const amount = this.calculateAmount(referral, base);
    if (amount <= 0) return null;
    const repository = manager.getRepository(ReferralCommission);
    const saved = await repository.save(
      repository.create({
        tenant_id: getCurrentTenantId(),
        dossier_referral_id: referral.id,
        dossier_referral: referral,
        facture_id: facture.id,
        facture,
        paiement_id: paiement?.id ?? null,
        paiement,
        amount,
        status: CommissionStatus.CALCULATED,
        calculation_date: new Date(),
        payment_date: null,
        payment_method: null,
        payment_reference: null,
        notes: null,
        calculated_by_id: null,
        approved_by_id: null,
        approved_at: null,
        paid_by_id: null,
        cancelled_by_id: null,
        cancelled_at: null,
        cancellation_reason: null,
      }),
    );
    await this.auditService.append(manager, {
      actorId: null,
      action: `referral_commission.calculated_from_${source}`,
      resourceType: 'referral_commission',
      resourceId: saved.id,
      dossierId: referral.dossier_id,
      afterState: this.auditState(saved),
    });
    return saved;
  }

  private async resolveSources(
    manager: EntityManager,
    dossierReferralId: number,
    factureId?: string | null,
    paiementId?: string | null,
  ): Promise<ResolvedCommissionSources> {
    const tenantId = getCurrentTenantId();
    const referral = await manager
      .getRepository(DossierReferral)
      .findOne({
        where: { id: dossierReferralId, tenant_id: tenantId },
        relations: ['dossier', 'referrer'],
      });
    if (!referral) {
      throw new NotFoundException('Apport de dossier non trouvé');
    }
    let facture: Facture | null = null;
    let paiement: Paiement | null = null;
    if (paiementId) {
      paiement = await manager.getRepository(Paiement).findOne({
        where: {
          id: paiementId,
          tenant_id: tenantId,
          status: StatutPaiement.VALIDE,
        },
        relations: ['facture'],
      });
      if (!paiement) {
        throw new NotFoundException(
          'Paiement source validé non trouvé',
        );
      }
      facture = paiement.facture;
      if (factureId && facture.id !== factureId) {
        throw new BadRequestException(
          'Le paiement ne correspond pas à la facture source',
        );
      }
    } else if (factureId) {
      facture = await manager.getRepository(Facture).findOne({
        where: { id: factureId, tenant_id: tenantId },
      });
      if (!facture) {
        throw new NotFoundException('Facture source non trouvée');
      }
    }
    if (
      facture &&
      facture.dossier_id !== referral.dossier_id
    ) {
      throw new BadRequestException(
        "La facture et l'apport n'appartiennent pas au même dossier",
      );
    }
    if (
      facture &&
      ![
        StatutFacture.VALIDEE,
        StatutFacture.PARTIELLEMENT_PAYEE,
        StatutFacture.PAYEE,
      ].includes(facture.status)
    ) {
      throw new BadRequestException(
        'La facture source doit être validée',
      );
    }
    return { referral, facture, paiement };
  }

  private assertSourceRequired(
    sources: ResolvedCommissionSources,
  ): void {
    if (
      [
        CommissionBasis.INVOICED_HT,
        CommissionBasis.INVOICED_TTC,
      ].includes(sources.referral.commission_basis) &&
      !sources.facture
    ) {
      throw new BadRequestException(
        'Une facture validée est obligatoire pour cette base de commission',
      );
    }
    if (
      [
        CommissionBasis.COLLECTED_HT,
        CommissionBasis.COLLECTED_TTC,
      ].includes(sources.referral.commission_basis) &&
      !sources.paiement
    ) {
      throw new BadRequestException(
        'Un paiement client validé est obligatoire pour cette base de commission',
      );
    }
  }

  private async lockCommission(
    manager: EntityManager,
    id: number,
  ): Promise<ReferralCommission> {
    const repository = manager.getRepository(ReferralCommission);
    const locked = await repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) {
      throw new NotFoundException('Commission non trouvée');
    }
    const commission = await repository.findOne({
      where: { id: locked.id, tenant_id: getCurrentTenantId() },
      relations: [
        'dossier_referral',
        'dossier_referral.referrer',
        'facture',
        'paiement',
      ],
    });
    if (!commission) {
      throw new NotFoundException('Commission non trouvée');
    }
    return commission;
  }

  private async lockReferralByDossier(
    manager: EntityManager,
    dossierId: number,
  ): Promise<DossierReferral | null> {
    return manager.getRepository(DossierReferral).findOne({
      where: {
        dossier_id: dossierId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['referrer'],
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async fixedCommissionExists(
    manager: EntityManager,
    referral: DossierReferral,
  ): Promise<boolean> {
    if (referral.commission_mode !== CommissionMode.FIXED_AMOUNT) {
      return false;
    }
    return manager.getRepository(ReferralCommission).exists({
      where: {
        tenant_id: getCurrentTenantId(),
        dossier_referral_id: referral.id,
      },
    });
  }

  private async resolveActor(
    manager: EntityManager,
    actor: ReferralCommissionActor,
  ): Promise<User> {
    const actorId = Number(actor?.userId ?? actor?.id);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('Acteur authentifié obligatoire');
    }
    const user = await manager.getRepository(User).findOne({
      where: { id: actorId, tenant_id: getCurrentTenantId() },
    });
    if (!user) {
      throw new ForbiddenException('Utilisateur introuvable');
    }
    return user;
  }

  private calculateAmount(
    referral: DossierReferral,
    base: number,
  ): number {
    if (!Number.isFinite(base) || base <= 0) return 0;
    if (referral.commission_mode === CommissionMode.FIXED_AMOUNT) {
      const fixed = Number(referral.commission_amount ?? 0);
      return fixed > 0
        ? this.fromMinorUnits(this.toMinorUnits(fixed))
        : 0;
    }
    const rate = Number(referral.commission_rate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    const baseMinor = Math.round(base * 100);
    if (!Number.isSafeInteger(baseMinor) || baseMinor <= 0) {
      return 0;
    }
    return this.fromMinorUnits(
      Math.round(baseMinor * rate / 100),
    );
  }

  private parsePastDate(value: string, message: string): Date {
    const date = new Date(value);
    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException(message);
    }
    return date;
  }

  private toMinorUnits(value: number | string): number {
    const numeric = Number(value);
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      !Number.isFinite(numeric) ||
      numeric <= 0 ||
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Le montant doit être positif avec au plus deux décimales',
      );
    }
    return rounded;
  }

  private fromMinorUnits(value: number): number {
    return value / 100;
  }

  private auditState(
    commission: ReferralCommission,
  ): Record<string, unknown> {
    return {
      status: commission.status,
      dossierReferralId: commission.dossier_referral_id,
      invoiceId: commission.facture_id,
      sourcePaymentId: commission.paiement_id,
      amount: Number(commission.amount),
      paymentDate: commission.payment_date,
      paymentMethod: commission.payment_method,
      paymentReference: commission.payment_reference,
    };
  }

  private enrichCommission(
    commission: ReferralCommission,
  ): ReferralCommission {
    const referrer = commission.dossier_referral?.referrer as
      | Referrer
      | undefined;
    return {
      ...commission,
      amount: Number(commission.amount ?? 0),
      status_label: this.getStatusLabel(commission.status),
      dossier_number:
        commission.dossier_referral?.dossier?.dossier_number ?? null,
      referrer_name: this.getReferrerDisplayName(referrer),
    } as unknown as ReferralCommission;
  }

  private getStatusLabel(status: CommissionStatus): string {
    const labels: Record<CommissionStatus, string> = {
      [CommissionStatus.CALCULATED]: 'Calculée',
      [CommissionStatus.APPROVED]: 'Approuvée',
      [CommissionStatus.PAID]: 'Payée',
      [CommissionStatus.CANCELLED]: 'Annulée',
    };
    return labels[status] ?? String(status ?? '');
  }

  private getReferrerDisplayName(
    referrer?: Referrer | null,
  ): string | null {
    if (!referrer) return null;
    const employeeUser = (referrer as any).employee?.user;
    const employeeName =
      [employeeUser?.first_name, employeeUser?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || (referrer as any).employee?.full_name;
    return (
      referrer.company_name ||
      referrer.contact_name ||
      (referrer as any).customer?.company_name ||
      (referrer as any).customer?.full_name ||
      employeeName ||
      null
    );
  }
}
