import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { DossierReferral } from './entities/dossier-referral.entity';
import { CreateDossierReferralDto } from './dto/create-dossier-referral.dto';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Referrer } from './entities/referral.entity';
import { UpdateDossierReferralDto } from './dto/update-dossier-referral.dto';

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

    // Le taux de commission est obligatoire en base (NOT NULL). Si non fourni,
    // on retombe sur le taux par défaut de l'apporteur ; sinon on refuse
    // proprement (400) au lieu de laisser MySQL lever « cannot be null ».
    const rawRate =
      dto.commission_rate ?? referrer.default_commission_rate ?? null;
    if (rawRate === null || rawRate === undefined || isNaN(Number(rawRate))) {
      throw new BadRequestException(
        "Le taux de commission est requis (aucun taux par défaut défini pour cet apporteur)",
      );
    }
    entity.commission_rate = Number(rawRate);

    return this.repository.save(entity);
  }

  findAll(): Promise<DossierReferral[]> {
    return this.repository.find({
      relations: ['dossier', 'referrer', 'commissions'],
      order: { referral_date: 'DESC' },
    });
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
    return referral;
  }

  async findByDossier(dossier_id: number): Promise<DossierReferral | null> {
    return this.repository.findOne({
      where: { dossier_id },
      relations: ['referrer', 'commissions'],
    });
  }

  async findByReferrer(referrer_id: number): Promise<DossierReferral[]> {
    return this.repository.find({
      where: { referrer_id },
      relations: ['dossier', 'dossier.client', 'commissions'],
      order: { referral_date: 'DESC' },
    });
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
    return this.repository.save({ ...referral, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}