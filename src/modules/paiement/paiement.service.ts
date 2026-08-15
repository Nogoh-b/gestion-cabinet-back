// src/paiement/paiement.service.ts
import { plainToInstance } from 'class-transformer';
import { join } from 'path';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchCriteria, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { Repository } from 'typeorm';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { StatutFacture } from '../facture/dto/create-facture.dto';
import { Facture } from '../facture/entities/facture.entity';
import { CreatePaiementDto, ModePaiement, StatutPaiement } from './dto/create-paiement.dto';
import { PaiementResponseDto } from './dto/paiement-response.dto';
import { SearchPaiementDto } from './dto/search-paiement.dto';
import { UpdatePaiementDto } from './dto/update-paiement.dto';
import { Paiement } from './entities/paiement.entity';

@Injectable()
export class PaiementService extends BaseServiceV1<Paiement> {
  constructor(
    @InjectRepository(Paiement)
    protected readonly repository: Repository<Paiement>,
    @InjectRepository(Facture)
    private readonly factureRepository: Repository<Facture>,
    protected readonly paginationService: PaginationServiceV1,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['reference', 'numeroCheque', 'banque', 'titulaire', 'notes'],
      exactMatchFields: ['id', 'factureId', 'modePaiement', 'status', 'reference'],
      dateRangeFields: ['datePaiement', 'dateValeur', 'created_at', 'updated_at'],
      relationFields: ['facture', 'facture.client', 'facture.dossier'],
    };
  }

  async createPaiement(
    createDto: CreatePaiementDto,
    file?: Express.Multer.File,
  ): Promise<PaiementResponseDto> {
    const facture = await this.loadFactureForPayment(createDto.factureId);
    this.assertFactureAcceptsPayment(facture);

    const montant = this.normalizeAmount(createDto.montant);
    const status = this.normalizePaymentStatus(createDto.status ?? StatutPaiement.VALIDE);

    if (status === StatutPaiement.VALIDE) {
      this.assertNoOverpayment(facture, montant);
    }

    const { notify_client, modePaiment, ...persistable } = createDto as any;
    const paiement = this.repository.create({
      ...persistable,
      factureId: facture.id,
      montant,
      modePaiement: this.normalizePaymentMode(createDto),
      status,
      datePaiement: createDto.datePaiement ?? new Date(),
      dateValeur: createDto.dateValeur ?? new Date(),
    } as Partial<Paiement>);
    paiement.notify_client = !!notify_client;

    if (file) {
      const uploaded = await FilesUtil.uploadFileV1(
        file,
        join(UPLOAD_DOCS_PATH, 'paiements'),
        { maxSizeKB: 3000 },
      );
      paiement.preuvePaiement = uploaded.fileUrl;
    }

    const saved = await this.repository.save(paiement);
    await this.updateFactureStatus(facture.id);

    return plainToInstance(PaiementResponseDto, saved);
  }

  async updateFacture(factureId: string): Promise<void> {
    await this.updateFactureStatus(factureId);
  }

  async updatePaiement(id: string, updateDto: UpdatePaiementDto): Promise<PaiementResponseDto> {
    const paiement = await this.findOneV1(id, [
      'facture',
      'facture.paiements',
      'facture.client',
      'facture.dossier',
    ]) as Paiement | null;

    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }
    if (!paiement.facture) {
      throw new NotFoundException(`Facture du paiement ${id} non trouvee`);
    }

    this.assertFactureAcceptsPayment(paiement.facture);

    const nextStatus = updateDto.status !== undefined
      ? this.normalizePaymentStatus(updateDto.status)
      : paiement.status;
    const nextMontant = updateDto.montant !== undefined
      ? this.normalizeAmount(updateDto.montant)
      : Number(paiement.montant);

    if (nextStatus === StatutPaiement.VALIDE) {
      this.assertNoOverpayment(paiement.facture, nextMontant, paiement.id);
    }

    const { notify_client, modePaiment, ...persistable } = updateDto as any;
    Object.assign(paiement, persistable);
    paiement.montant = nextMontant;
    paiement.status = nextStatus;

    if ((updateDto as any).modePaiement !== undefined || modePaiment !== undefined) {
      paiement.modePaiement = this.normalizePaymentMode(updateDto);
    }
    if (notify_client !== undefined) {
      paiement.notify_client = !!notify_client;
    }

    const saved = await this.repository.save(paiement);
    await this.updateFactureStatus(saved.factureId);

    return plainToInstance(PaiementResponseDto, saved);
  }

  async searchPaiements(searchDto: SearchPaiementDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };

    if (searchDto.montant_min !== undefined || searchDto.montant_max !== undefined) {
      criteria.montant = [
        searchDto.montant_min ?? 0,
        searchDto.montant_max ?? Number.MAX_SAFE_INTEGER,
      ];
    }

    return this.searchWithTransformer(
      criteria,
      PaiementResponseDto,
      searchDto,
      ['facture', 'facture.client', 'facture.dossier'],
      { datePaiement: 'DESC' } as any,
    );
  }

  async getPaiementsByFacture(factureId: string): Promise<Paiement[]> {
    return this.findAllV1({ factureId }, undefined, ['facture']);
  }

  async getPaiementsByClient(clientId: string): Promise<Paiement[]> {
    const qb = this.repository
      .createQueryBuilder('paiement')
      .leftJoinAndSelect('paiement.facture', 'facture')
      .where('facture.clientId = :clientId', { clientId })
      .orderBy('paiement.datePaiement', 'DESC');
    // Isolation multi-tenant.
    addTenantCondition(qb, 'paiement');
    return qb.getMany();
  }

  async validerPaiement(id: string): Promise<Paiement> {
    const paiement = await this.findOneV1(id, [
      'facture',
      'facture.paiements',
      'facture.client',
      'facture.dossier',
    ]) as Paiement | null;

    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }
    if (!paiement.facture) {
      throw new NotFoundException(`Facture du paiement ${id} non trouvee`);
    }

    this.assertFactureAcceptsPayment(paiement.facture);
    this.assertNoOverpayment(paiement.facture, Number(paiement.montant), paiement.id);

    paiement.status = StatutPaiement.VALIDE;

    const saved = await this.repository.save(paiement);
    await this.updateFactureStatus(saved.factureId);

    return saved;
  }

  async rejeterPaiement(id: string, raison: string): Promise<Paiement> {
    const paiement = await this.findOneV1(id, ['facture']) as Paiement | null;
    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }

    const factureId = paiement.factureId ?? paiement.facture?.id;
    paiement.status = StatutPaiement.REJETE;
    paiement.notes = raison + (paiement.notes ? `\n${paiement.notes}` : '');

    const saved = await this.repository.save(paiement);
    if (factureId) {
      await this.updateFactureStatus(factureId);
    }

    return saved;
  }

  async removePaiement(id: string): Promise<Paiement | null> {
    const paiement = await this.findOneV1(id, ['facture']) as Paiement | null;
    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }

    const factureId = paiement.factureId ?? paiement.facture?.id;
    const removed = await this.removeV1(id);

    if (factureId) {
      await this.updateFactureStatus(factureId);
    }

    return removed as Paiement | null;
  }

  async getPaiementsEnAttente(): Promise<Paiement[]> {
    return this.findAllV1({ status: StatutPaiement.EN_ATTENTE }, undefined, ['facture']);
  }

  async getStatistiquesPaiementsParPeriode(dateDebut: Date, dateFin: Date): Promise<any> {
    const parModeQB = this.repository
      .createQueryBuilder('paiement')
      .select('paiement.mode', 'mode')
      .addSelect('COUNT(*)', 'nombre')
      .addSelect('SUM(paiement.montant)', 'montantTotal')
      .where('paiement.datePaiement BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('paiement.statut = :statut', { statut: 'valide' })
      .groupBy('paiement.mode');
    // Isolation multi-tenant.
    addTenantCondition(parModeQB, 'paiement');
    const result = await parModeQB.getRawMany();

    const totalQB = this.repository
      .createQueryBuilder('paiement')
      .select('SUM(paiement.montant)', 'total')
      .where('paiement.datePaiement BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('paiement.statut = :statut', { statut: 'valide' });
    addTenantCondition(totalQB, 'paiement');
    const total = await totalQB.getRawOne();

    return {
      total: parseFloat(total?.total) || 0,
      parMode: result.map(row => ({
        mode: row.mode,
        nombre: parseInt(row.nombre, 10),
        montantTotal: parseFloat(row.montantTotal),
      })),
    };
  }

  private async loadFactureForPayment(factureId: string): Promise<Facture> {
    const facture = await this.factureRepository.findOne({
      where: { id: String(factureId) },
      relations: ['paiements', 'client', 'dossier'],
    });
    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${factureId} non trouvee`);
    }
    return facture;
  }

  private normalizeAmount(value: any): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Le montant du paiement doit etre strictement positif');
    }
    return amount;
  }

  private normalizePaymentStatus(value: any): StatutPaiement {
    if (typeof value === 'number') return value as StatutPaiement;

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as StatutPaiement;

    const labels: Record<string, StatutPaiement> = {
      en_attente: StatutPaiement.EN_ATTENTE,
      attente: StatutPaiement.EN_ATTENTE,
      valide: StatutPaiement.VALIDE,
      valid: StatutPaiement.VALIDE,
      rejete: StatutPaiement.REJETE,
      rejected: StatutPaiement.REJETE,
      annule: StatutPaiement.ANNULE,
      cancelled: StatutPaiement.ANNULE,
    };

    return labels[String(value).toLowerCase()] ?? StatutPaiement.VALIDE;
  }

  private normalizePaymentMode(dto: Partial<CreatePaiementDto> | any): ModePaiement {
    const value = dto.modePaiement ?? dto.modePaiment ?? dto.mode ?? ModePaiement.VIREMENT;
    if (typeof value === 'number') return value as ModePaiement;

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as ModePaiement;

    const labels: Record<string, ModePaiement> = {
      virement: ModePaiement.VIREMENT,
      cheque: ModePaiement.CHEQUE,
      especes: ModePaiement.ESPECES,
      carte: ModePaiement.CARTE,
      prelevement: ModePaiement.PRELEVEMENT,
      mobile: ModePaiement.Mobile,
      autre: ModePaiement.AUTRE,
    };

    return labels[String(value).toLowerCase()] ?? ModePaiement.VIREMENT;
  }

  private assertFactureAcceptsPayment(facture: Facture): void {
    if (facture.status === StatutFacture.ANNULEE) {
      throw new BadRequestException('Impossible d enregistrer un paiement sur une facture annulee');
    }
  }

  private getValidatedPaidAmount(facture: Facture, excludePaymentId?: string): number {
    return (facture.paiements ?? [])
      .filter(p => p.status === StatutPaiement.VALIDE && p.id !== excludePaymentId)
      .reduce((sum, p) => sum + Number(p.montant ?? 0), 0);
  }

  private assertNoOverpayment(facture: Facture, amount: number, excludePaymentId?: string): void {
    const alreadyPaid = this.getValidatedPaidAmount(facture, excludePaymentId);
    const remaining = Number(facture.montantTTC) - alreadyPaid;

    if (amount > remaining + 0.01) {
      throw new BadRequestException(
        `Le montant du paiement (${amount.toFixed(2)}) depasse le reste a payer (${remaining.toFixed(2)})`,
      );
    }
  }

  private async updateFactureStatus(factureId: string): Promise<Facture | null> {
    const facture = await this.factureRepository.findOne({
      where: { id: factureId },
      relations: ['paiements', 'client', 'dossier'],
    });
    if (!facture) return null;
    if (facture.status === StatutFacture.ANNULEE) return facture;

    const totalPaye = this.getValidatedPaidAmount(facture);
    const totalTtc = Number(facture.montantTTC);
    const previousStatus = facture.status;

    if (totalPaye <= 0) {
      facture.status = StatutFacture.ENVOYEE;
    } else if (totalPaye < totalTtc) {
      facture.status = StatutFacture.PARTIELLEMENT_PAYEE;
    } else {
      facture.status = StatutFacture.PAYEE;
    }

    if (previousStatus !== facture.status) {
      await this.factureRepository.save(facture);
    }

    return facture;
  }

}
