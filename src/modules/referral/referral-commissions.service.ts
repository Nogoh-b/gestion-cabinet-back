import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { ReferralCommission, CommissionStatus } from './entities/referral-commission.entity';
import { CreateReferralCommissionDto } from './dto/create-referral-commission.dto';
import { UpdateReferralCommissionDto } from './dto/update-referral-commission.dto';
import { DossierReferral } from './entities/dossier-referral.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';

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
      // Facture utilise un ID string (UUID)
      const facture = await this.factureRepo.findOne({
        where: { id: String(dto.facture_id) },
      });
      if (!facture) throw new NotFoundException('Facture non trouvée');
      entity.facture = facture;
    }

    if (dto.paiement_id) {
      // Paiement utilise probablement un ID number
      const paiement = await this.paiementRepo.findOne({
        where: { id: dto.paiement_id },
      });
      if (!paiement) throw new NotFoundException('Paiement non trouvé');
      entity.paiement = paiement;
    }

    return this.repository.save(entity);
  }

  findAll(): Promise<ReferralCommission[]> {
    return this.repository.find({
      relations: [
        'dossier_referral',
        'dossier_referral.referrer',
        'dossier_referral.dossier',
        'facture',
        'paiement',
      ],
      order: { calculation_date: 'DESC' },
    });
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
    return commission;
  }

  async findByReferral(dossier_referral_id: number): Promise<ReferralCommission[]> {
    return this.repository.find({
      where: { dossier_referral_id },
      relations: ['facture', 'paiement'],
      order: { calculation_date: 'DESC' },
    });
  }

  async findByReferrer(referrer_id: number): Promise<ReferralCommission[]> {
    return this.repository.find({
      where: {
        dossier_referral: { referrer_id },
      },
      relations: [
        'dossier_referral',
        'dossier_referral.dossier',
        'facture',
        'paiement',
      ],
      order: { calculation_date: 'DESC' },
    });
  }

  async approve(id: number): Promise<ReferralCommission> {
    const commission = await this.findOne(id);
    if (commission.status !== CommissionStatus.CALCULATED) {
      throw new Error('Seules les commissions calculées peuvent être approuvées');
    }
    commission.status = CommissionStatus.APPROVED;
    return this.repository.save(commission);
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
    return this.repository.save(commission);
  }

  async cancel(id: number): Promise<ReferralCommission> {
    const commission = await this.findOne(id);
    if (commission.status === CommissionStatus.PAID) {
      throw new Error('Une commission déjà payée ne peut pas être annulée');
    }
    commission.status = CommissionStatus.CANCELLED;
    return this.repository.save(commission);
  }

  async update(
    id: number,
    dto: UpdateReferralCommissionDto,
  ): Promise<ReferralCommission> {
    const commission = await this.findOne(id);

    if (dto.dossier_referral_id) {
      const dossierReferral = await this.dossierReferralRepo.findOne({
        where: { id: dto.dossier_referral_id },
      });
      if (!dossierReferral) throw new NotFoundException('Apport de dossier non trouvé');
      commission.dossier_referral = dossierReferral;
    }

    if (dto.facture_id) {
      const facture = await this.factureRepo.findOne({
        where: { id: String(dto.facture_id) },
      });
      if (!facture) throw new NotFoundException('Facture non trouvée');
      commission.facture = facture;
    }

    if (dto.paiement_id) {
      const paiement = await this.paiementRepo.findOne({
        where: { id: dto.paiement_id },
      });
      if (!paiement) throw new NotFoundException('Paiement non trouvé');
      commission.paiement = paiement;
    }

    return this.repository.save({ ...commission, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}