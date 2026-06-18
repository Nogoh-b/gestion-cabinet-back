import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder } from 'typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchCriteria,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { CommissionMode, DossierReferral } from './entities/dossier-referral.entity';
import { CreateDossierReferralDto } from './dto/create-dossier-referral.dto';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Referrer } from './entities/referral.entity';
import { UpdateDossierReferralDto } from './dto/update-dossier-referral.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { PaginatedResult } from 'src/core/shared/services/pagination/paginations-v1.service';
import { CommissionStatus } from './entities/referral-commission.entity';

@Injectable()
export class DossierReferralsService extends BaseServiceV1<DossierReferral> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(DossierReferral)
    protected repository: Repository<DossierReferral>,
    @InjectRepository(Dossier)
    private dossierRepo: Repository<Dossier>,
    @InjectRepository(Referrer)
    private referrerRepo: Repository<Referrer>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateDossierReferralDto): Promise<DossierReferral> {
    // Vérifier qu'il n'y a pas déjà un apporteur pour ce dossier
    const existing = await this.repository.findOne({
      where: { dossier_id: dto.dossier_id },
    });
    if (existing) {
      throw new ConflictException('Ce dossier a déjà un apporteur');
    }

    const entity = this.repository.create(dto);

    const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
    if (!dossier) throw new NotFoundException('Dossier non trouvé');
    entity.dossier = dossier;

    const referrer = await this.referrerRepo.findOne({ where: { id: dto.referrer_id } });
    if (!referrer) throw new NotFoundException('Apporteur non trouvé');
    entity.referrer = referrer;

    this.applyCommissionRules(entity, dto, referrer);

    const saved = await this.repository.save(entity);
    const full = await this.findOne(saved.id);
    return this.enrichReferral(full);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [
        'dossier.dossier_number',
        'dossier.object',
        'referrer.company_name',
        'referrer.contact_name',
      ],
      exactMatchFields: ['id', 'dossier_id', 'referrer_id', 'commission_basis', 'commission_mode'],
      dateRangeFields: ['created_at', 'updated_at', 'referral_date'],
      relationFields: [
        'dossier',
        'dossier.client',
        'referrer',
        'referrer.employee',
        'referrer.employee.user',
        'referrer.customer',
        'commissions',
      ],
    };
  }

  async searchWithTransformer<R>(
    criteria: SearchCriteria,
    dtoClass: new (...args: any[]) => R,
    paginationParams?: PaginationParamsDto,
    relations?: string[] | null,
    order?: FindOptionsOrder<DossierReferral>,
  ): Promise<PaginatedResult<R>> {
    const result = await super.searchWithTransformer(
      criteria,
      dtoClass,
      paginationParams,
      relations,
      order,
    );

    return {
      ...result,
      data: result.data.map((item: any) => this.enrichReferral(item)) as R[],
    };
  }

  findAll(): Promise<DossierReferral[]> {
    return this.repository.find({
      relations: ['dossier', 'referrer', 'commissions'],
      order: { referral_date: 'DESC' },
    }).then((items) => items.map((item) => this.enrichReferral(item)));
  }

  async findOne(id: number): Promise<DossierReferral> {
    const referral = await this.repository.findOne({
      where: { id },
      relations: [
        'dossier',
        'dossier.client',
        'referrer',
        'commissions',
        'commissions.facture',
        'commissions.paiement',
      ],
    });
    if (!referral) throw new NotFoundException('Apport de dossier non trouvé');
    return this.enrichReferral(referral);
  }

  async findByDossier(dossier_id: number): Promise<DossierReferral | null> {
    const referral = await this.repository.findOne({
      where: { dossier_id },
      relations: [
        'dossier',
        'dossier.client',
        'referrer',
        'referrer.employee',
        'referrer.employee.user',
        'referrer.customer',
        'commissions',
      ],
    });
    return referral ? this.enrichReferral(referral) : null;
  }

  async findByReferrer(referrer_id: number): Promise<DossierReferral[]> {
    return this.repository.find({
      where: { referrer_id },
      relations: [
        'dossier',
        'dossier.client',
        'referrer',
        'referrer.employee',
        'referrer.employee.user',
        'referrer.customer',
        'commissions',
      ],
      order: { referral_date: 'DESC' },
    }).then((items) => items.map((item) => this.enrichReferral(item)));
  }

  async update(id: number, dto: UpdateDossierReferralDto): Promise<DossierReferral> {
    const referral = await this.findOne(id);
    if (dto.dossier_id && dto.dossier_id !== referral.dossier_id) {
      const existing = await this.repository.findOne({
        where: { dossier_id: dto.dossier_id },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ce dossier a déjà un apporteur');
      }
      const dossier = await this.dossierRepo.findOne({ where: { id: dto.dossier_id } });
    if (!dossier) throw new NotFoundException('Dossier non trouvé');
    referral.dossier = dossier;
    }
    if (dto.referrer_id) {
      const referrer = await this.referrerRepo.findOne({ where: { id: dto.referrer_id } });
      if (!referrer) throw new NotFoundException('Apporteur non trouvé');
      referral.referrer = referrer;
    }
    const merged = { ...referral, ...dto } as DossierReferral;
    this.applyCommissionRules(merged, merged as UpdateDossierReferralDto, referral.referrer);
    await this.repository.save(merged);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  private enrichReferral(referral: DossierReferral): DossierReferral {
    const commissions = referral.commissions ?? [];
    const totalPaid = commissions
      .filter((item) => item.status === CommissionStatus.PAID)
      .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const totalPending = commissions
      .filter((item) => item.status !== CommissionStatus.PAID && item.status !== CommissionStatus.CANCELLED)
      .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

    return {
      ...referral,
      commission_rate: Number(referral.commission_rate ?? 0),
      commission_amount: referral.commission_amount != null ? Number(referral.commission_amount) : null,
      commission_mode: referral.commission_mode ?? CommissionMode.RATE,
      total_paid_commissions: totalPaid,
      total_pending_commissions: totalPending,
      commission_basis_label: this.getBasisLabel(referral.commission_basis),
      dossier_number: referral.dossier?.dossier_number ?? null,
      dossier_object: referral.dossier?.object ?? null,
      referrer_name: this.getReferrerDisplayName(referral.referrer),
    } as unknown as DossierReferral;
  }

  private getBasisLabel(basis: DossierReferral['commission_basis']): string {
    const labels: Record<string, string> = {
      invoiced_ht: 'Facture HT',
      invoiced_ttc: 'Facture TTC',
      collected_ht: 'Encaisse HT',
      collected_ttc: 'Encaisse TTC',
    };
    return labels[basis] ?? String(basis ?? '');
  }

  private getReferrerDisplayName(referrer?: Referrer | null): string | null {
    if (!referrer) return null;

    const employeeUser = (referrer as any).employee?.user;
    const employeeName =
      [employeeUser?.first_name, employeeUser?.last_name].filter(Boolean).join(' ').trim() ||
      (referrer as any).employee?.full_name;

    return (
      referrer.company_name ||
      referrer.contact_name ||
      (referrer as any).customer?.company_name ||
      (referrer as any).customer?.full_name ||
      employeeName ||
      null
    );
  }

  private applyCommissionRules(
    entity: DossierReferral,
    dto: Partial<CreateDossierReferralDto>,
    referrer?: Referrer | null,
  ): void {
    const mode =
      dto.commission_mode ??
      entity.commission_mode ??
      (dto.commission_amount !== undefined && dto.commission_amount !== null
        ? CommissionMode.FIXED_AMOUNT
        : CommissionMode.RATE);

    entity.commission_mode = mode;

    if (mode === CommissionMode.FIXED_AMOUNT) {
      const rawAmount = dto.commission_amount ?? entity.commission_amount;
      const amount = Number(rawAmount);
      if (rawAmount === null || rawAmount === undefined || isNaN(amount) || amount <= 0) {
        throw new BadRequestException('Le montant fixe de commission est requis et doit etre superieur a 0');
      }
      entity.commission_amount = amount;
      entity.commission_rate = Number(dto.commission_rate ?? entity.commission_rate ?? 0);
      return;
    }

    const rawRate = dto.commission_rate ?? entity.commission_rate ?? referrer?.default_commission_rate ?? null;
    const rate = Number(rawRate);
    if (rawRate === null || rawRate === undefined || isNaN(rate)) {
      throw new BadRequestException(
        "Le taux de commission est requis (aucun taux par defaut defini pour cet apporteur)",
      );
    }
    if (rate < 0 || rate > 100) {
      throw new BadRequestException('Le taux de commission doit etre compris entre 0 et 100');
    }
    entity.commission_rate = rate;
    entity.commission_amount = dto.commission_amount ?? entity.commission_amount ?? null;
  }
}
