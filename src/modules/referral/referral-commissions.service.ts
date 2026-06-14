import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchCriteria,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { ReferralCommission, CommissionStatus } from './entities/referral-commission.entity';
import { CreateReferralCommissionDto } from './dto/create-referral-commission.dto';
import { UpdateReferralCommissionDto } from './dto/update-referral-commission.dto';
import { DossierReferral } from './entities/dossier-referral.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { PaginatedResult } from 'src/core/shared/services/pagination/paginations-v1.service';
import { FindOptionsOrder } from 'typeorm';
import { Referrer } from './entities/referral.entity';

@Injectable()
export class ReferralCommissionsService extends BaseServiceV1<ReferralCommission> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(ReferralCommission)
    protected repository: Repository<ReferralCommission>,
    @InjectRepository(DossierReferral)
    private dossierReferralRepo: Repository<DossierReferral>,
    @InjectRepository(Facture)
    private factureRepo: Repository<Facture>,
    @InjectRepository(Paiement)
    private paiementRepo: Repository<Paiement>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateReferralCommissionDto): Promise<ReferralCommission> {
    dto = this.normalizeCommissionDto(dto) as CreateReferralCommissionDto;
    const entity = this.repository.create({
      ...dto,
      status: CommissionStatus.CALCULATED,
    });

    // dossier_referral_id est number dans ReferralCommission
    // mais l'ID de DossierReferral est string (UUID)
    // => il faut convertir si nécessaire, ou ajuster selon le vrai type
    const dossierReferral = await this.dossierReferralRepo.findOne({
      where: { id: dto.dossier_referral_id },  // Retirer le String()
      relations: ['referrer', 'dossier'],
    });
    
    if (!dossierReferral) throw new NotFoundException('Apport de dossier non trouvé');
    entity.dossier_referral = dossierReferral;

    if (dto.facture_id) {
      const facture = await this.factureRepo.findOne({
        where: { id: dto.facture_id },
      });
      if (!facture) throw new NotFoundException('Facture non trouvée');
      entity.facture = facture;
    }

    if (dto.paiement_id) {
      const paiement = await this.paiementRepo.findOne({
        where: { id: dto.paiement_id },
      });
      if (!paiement) throw new NotFoundException('Paiement non trouvé');
      entity.paiement = paiement;
    }

    const saved = await this.repository.save(entity);
    return this.findOne(saved.id);
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
      exactMatchFields: ['id', 'dossier_referral_id', 'facture_id', 'paiement_id', 'status'],
      dateRangeFields: ['created_at', 'updated_at', 'calculation_date', 'payment_date'],
      relationFields: [
        'dossier_referral',
        'dossier_referral.dossier',
        'dossier_referral.dossier.client',
        'dossier_referral.referrer',
        'dossier_referral.referrer.employee',
        'dossier_referral.referrer.employee.user',
        'dossier_referral.referrer.customer',
        'facture',
        'paiement',
      ],
    };
  }

  async searchWithTransformer<R>(
    criteria: SearchCriteria,
    dtoClass: new (...args: any[]) => R,
    paginationParams?: PaginationParamsDto,
    relations?: string[] | null,
    order?: FindOptionsOrder<ReferralCommission>,
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
      data: result.data.map((item: any) => this.enrichCommission(item)) as R[],
    };
  }

  findAll(): Promise<ReferralCommission[]> {
    return this.repository.find({
      relations: [
        'dossier_referral',
        'dossier_referral.referrer',
        'dossier_referral.referrer.employee',
        'dossier_referral.referrer.employee.user',
        'dossier_referral.referrer.customer',
        'dossier_referral.dossier',
        'facture',
        'paiement',
      ],
      order: { calculation_date: 'DESC' },
    }).then((items) => items.map((item) => this.enrichCommission(item)));
  }

  async findOne(id: number): Promise<ReferralCommission> {
    const commission = await this.repository.findOne({
      where: { id },
      relations: [
        'dossier_referral',
        'dossier_referral.referrer',
        'dossier_referral.dossier',
        'facture',
        'paiement',
      ],
    });
    if (!commission) throw new NotFoundException('Commission non trouvée');
    return this.enrichCommission(commission);
  }

  async findByReferral(dossier_referral_id: number): Promise<ReferralCommission[]> {
    return this.repository.find({
      where: { dossier_referral_id },
      relations: [
        'dossier_referral',
        'dossier_referral.dossier',
        'dossier_referral.referrer',
        'dossier_referral.referrer.employee',
        'dossier_referral.referrer.employee.user',
        'dossier_referral.referrer.customer',
        'facture',
        'paiement',
      ],
      order: { calculation_date: 'DESC' },
    }).then((items) => items.map((item) => this.enrichCommission(item)));
  }

  async findByReferrer(referrer_id: number): Promise<ReferralCommission[]> {
    return this.repository.find({
      where: {
        dossier_referral: { referrer_id },
      },
      relations: [
        'dossier_referral',
        'dossier_referral.dossier',
        'dossier_referral.referrer',
        'dossier_referral.referrer.employee',
        'dossier_referral.referrer.employee.user',
        'dossier_referral.referrer.customer',
        'facture',
        'paiement',
      ],
      order: { calculation_date: 'DESC' },
    }).then((items) => items.map((item) => this.enrichCommission(item)));
  }

  async approve(id: number): Promise<ReferralCommission> {
    const commission = await this.findOne(id);
    if (commission.status !== CommissionStatus.CALCULATED) {
      throw new Error('Seules les commissions calculées peuvent être approuvées');
    }
    commission.status = CommissionStatus.APPROVED;
    await this.repository.save(commission);
    return this.findOne(id);
  }

  async markAsPaid(
    id: number,
    payment_reference?: string,
  ): Promise<ReferralCommission> {
    const commission = await this.findOne(id);
    if (commission.status !== CommissionStatus.APPROVED) {
      throw new Error('Seules les commissions approuvées peuvent être payées');
    }
    commission.status = CommissionStatus.PAID;
    commission.payment_date = new Date();
    if (payment_reference) {
      commission.payment_reference = payment_reference;
    }
    await this.repository.save(commission);
    return this.findOne(id);
  }

  async cancel(id: number): Promise<ReferralCommission> {
    const commission = await this.findOne(id);
    if (commission.status === CommissionStatus.PAID) {
      throw new Error('Une commission déjà payée ne peut pas être annulée');
    }
    commission.status = CommissionStatus.CANCELLED;
    await this.repository.save(commission);
    return this.findOne(id);
  }

  async update(
    id: number,
    dto: UpdateReferralCommissionDto,
  ): Promise<ReferralCommission> {
    const commission = await this.findOne(id);
    dto = this.normalizeCommissionDto(dto) as UpdateReferralCommissionDto;

    if (dto.dossier_referral_id) {
      const dossierReferral = await this.dossierReferralRepo.findOne({
        where: { id: dto.dossier_referral_id },
      });
      if (!dossierReferral) throw new NotFoundException('Apport de dossier non trouvé');
      commission.dossier_referral = dossierReferral;
    }

    if (dto.facture_id) {
      const facture = await this.factureRepo.findOne({
        where: { id: dto.facture_id },
      });
      if (!facture) throw new NotFoundException('Facture non trouvée');
      commission.facture = facture;
    } else if (dto.facture_id === null) {
      commission.facture = null as any;
      commission.facture_id = null as any;
    }

    if (dto.paiement_id) {
      const paiement = await this.paiementRepo.findOne({
        where: { id: dto.paiement_id },
      });
      if (!paiement) throw new NotFoundException('Paiement non trouvé');
      commission.paiement = paiement;
    } else if (dto.paiement_id === null) {
      commission.paiement = null as any;
      commission.paiement_id = null as any;
    }

    await this.repository.save({ ...commission, ...dto });
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  private normalizeCommissionDto(
    dto: CreateReferralCommissionDto | UpdateReferralCommissionDto,
  ): CreateReferralCommissionDto | UpdateReferralCommissionDto {
    return {
      ...dto,
      dossier_referral_id: this.toNullableNumber(dto.dossier_referral_id) as any,
      facture_id: this.toNullableString(dto.facture_id) as any,
      paiement_id: this.toNullableString(dto.paiement_id) as any,
      amount: this.toNullableNumber(dto.amount) as any,
      notes: this.toNullableString(dto.notes) as any,
    };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toNullableString(value: unknown): string | null {
    if (value === '' || value === null || value === undefined) return null;
    return String(value);
  }

  private enrichCommission(commission: ReferralCommission): ReferralCommission {
    const referrer = commission.dossier_referral?.referrer as Referrer | undefined;

    return {
      ...commission,
      amount: Number(commission.amount ?? 0),
      status_label: this.getStatusLabel(commission.status),
      dossier_number: commission.dossier_referral?.dossier?.dossier_number ?? null,
      referrer_name: this.getReferrerDisplayName(referrer),
    } as unknown as ReferralCommission;
  }

  private getStatusLabel(status: CommissionStatus): string {
    const labels: Record<string, string> = {
      calculated: 'Calculee',
      approved: 'Approuvee',
      paid: 'Payee',
      cancelled: 'Annulee',
    };
    return labels[status] ?? String(status ?? '');
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
}
