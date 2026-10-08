// src/paiement/paiement.service.ts
import { plainToInstance } from 'class-transformer';
import { join } from 'path';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchCriteria,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { DataSource, In, Repository } from 'typeorm';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { StatutFacture, TypeFacture } from '../facture/dto/create-facture.dto';
import { Facture } from '../facture/entities/facture.entity';
import { FactureService } from '../facture/facture.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { generateEntityCode } from 'src/core/shared/utils/code.util';
import { AllocateDossierPaymentDto } from './dto/allocation-paiement.dto';
import {
  CreatePaiementDto,
  ModePaiement,
  StatutPaiement,
} from './dto/create-paiement.dto';
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
    private readonly dataSource: DataSource,
    private readonly factureService: FactureService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [
        'reference',
        'numeroCheque',
        'banque',
        'titulaire',
        'notes',
      ],
      exactMatchFields: [
        'id',
        'factureId',
        'modePaiement',
        'status',
        'reference',
      ],
      dateRangeFields: [
        'datePaiement',
        'dateValeur',
        'created_at',
        'updated_at',
      ],
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
    const status = this.normalizePaymentStatus(
      createDto.status ?? StatutPaiement.VALIDE,
    );

    if (status === StatutPaiement.VALIDE) {
      this.assertNoOverpayment(facture, montant);
    }

    const { notify_client, modePaiment, ...persistable } = createDto as any;
    const paiement = this.repository.create({
      ...persistable,
      facture,
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

  async updatePaiement(
    id: string,
    updateDto: UpdatePaiementDto,
  ): Promise<PaiementResponseDto> {
    const paiement = await this.findOneV1(id, [
      'facture',
      'facture.paiements',
      'facture.client',
      'facture.dossier',
    ]);

    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }
    if (!paiement.facture) {
      throw new NotFoundException(`Facture du paiement ${id} non trouvee`);
    }

    this.assertFactureAcceptsPayment(paiement.facture);

    const nextStatus =
      updateDto.status !== undefined
        ? this.normalizePaymentStatus(updateDto.status)
        : paiement.status;
    const nextMontant =
      updateDto.montant !== undefined
        ? this.normalizeAmount(updateDto.montant)
        : Number(paiement.montant);

    if (nextStatus === StatutPaiement.VALIDE) {
      this.assertNoOverpayment(paiement.facture, nextMontant, paiement.id);
    }

    const { notify_client, modePaiment, ...persistable } = updateDto as any;
    Object.assign(paiement, persistable);
    paiement.montant = nextMontant;
    paiement.status = nextStatus;

    if (
      (updateDto as any).modePaiement !== undefined ||
      modePaiment !== undefined
    ) {
      paiement.modePaiement = this.normalizePaymentMode(updateDto);
    }
    if (notify_client !== undefined) {
      paiement.notify_client = !!notify_client;
    }

    const saved = await this.repository.save(paiement);
    await this.updateFactureStatus(saved.factureId);

    return plainToInstance(PaiementResponseDto, saved);
  }

  /**
   * Encaissement groupé sur un dossier, atomique : soit des factures
   * cochées avec leur montant, soit un montant global ventilé
   * automatiquement des échéances les plus anciennes aux plus récentes.
   * Un trop-perçu est converti en avoir lié à la dernière facture soldée.
   */
  async allocateDossierPayment(
    dossierId: number,
    dto: AllocateDossierPaymentDto,
  ) {
    const tenantId = getCurrentTenantId();
    const manual =
      Array.isArray(dto.allocations) && dto.allocations.length > 0;
    const autoTotal = Number(dto.montant_total ?? 0);
    if (!manual && !(autoTotal > 0)) {
      throw new BadRequestException(
        'Indiquez des factures à encaisser ou un montant global à ventiler',
      );
    }
    if (manual && autoTotal > 0) {
      throw new BadRequestException(
        'Choisissez soit des factures cochées, soit un montant global',
      );
    }
    const round = (value: number): number =>
      Math.round((value + Number.EPSILON) * 100) / 100;
    const reference = (dto as any).reference?.trim() || generateEntityCode('ENC');
    const rawDate: string | undefined =
      (dto as any).date_paiement ?? (dto as any).datePaiement;
    const datePaiement = rawDate ? new Date(rawDate) : new Date();
    return this.dataSource.transaction(async (manager) => {
      const dossier = await manager.getRepository(Dossier).findOne({
        where: { id: dossierId, tenant_id: tenantId },
        relations: ['client'],
      });
      if (!dossier) {
        throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
      }
      // MySQL stocke les enums TS numériques dans un ENUM('0','1',...) :
      // comparé à des NOMBRES, `status IN (1,2,4)` matche l'INDEX 1-based
      // ('0','1','3' !) au lieu des valeurs. On compare avec des chaînes.
      const statutsEncaissables = [
        StatutFacture.BROUILLON,
        StatutFacture.ENVOYEE,
        StatutFacture.PARTIELLEMENT_PAYEE,
        StatutFacture.IMPAYEE,
      ].map(String);
      const factures = await manager.getRepository(Facture).find({
        where: {
          dossier_id: dossierId,
          tenant_id: tenantId,
          status: In(statutsEncaissables as unknown as StatutFacture[]),
        },
        relations: ['paiements'],
        order: { dateEcheance: 'ASC', dateFacture: 'ASC' },
      });
      const eligible = factures.filter(
        (facture) =>
          Number(facture.type) !== TypeFacture.AVOIR &&
          this.getRemainingAmount(facture) > 0.009,
      );
      if (!eligible.length) {
        throw new BadRequestException(
          'Aucune facture à encaisser sur ce dossier',
        );
      }
      const plan: Array<{ facture: Facture; montant: number }> = [];
      if (manual) {
        for (const rawAlloc of dto.allocations! as any[]) {
          const fid: string | undefined =
            rawAlloc.facture_id ??
            rawAlloc.factureId ??
            rawAlloc.id ??
            rawAlloc.facture_id_string;
          if (!fid) {
            throw new BadRequestException(
              "Chaque allocation doit contenir facture_id",
            );
          }
          const facture = eligible.find(
            (candidate) => candidate.id === fid,
          );
          if (!facture) {
            throw new BadRequestException(
              `La facture ${fid} n'est pas encaissable`,
            );
          }
          const montant = round(Number((rawAlloc as any).montant));
          if (!(montant > 0)) {
            throw new BadRequestException(
              'Le montant du paiement doit etre strictement positif',
            );
          }
          const remaining = this.getRemainingAmount(facture);
          if (montant > remaining + 0.01) {
            throw new BadRequestException(
              `Le montant (${montant.toFixed(2)}) depasse le reste à payer de la facture ${facture.numero} (${remaining.toFixed(2)})`,
            );
          }
          plan.push({ facture, montant });
        }
      } else {
        let left = round(autoTotal);
        for (const facture of eligible) {
          if (left <= 0.009) break;
          const take = Math.min(this.getRemainingAmount(facture), left);
          if (take > 0.009) {
            plan.push({ facture, montant: round(take) });
            left = round(left - take);
          }
        }
      }
      if (!plan.length) {
        throw new BadRequestException(
          'Aucune facture à encaisser sur ce dossier',
        );
      }
      const paiementRepo = manager.getRepository(Paiement);
      const allocations: Array<{
        facture_id: string;
        numero: string;
        montant: number;
        paid_after: number;
        remaining_after: number;
        status: StatutFacture;
      }> = [];
      for (const { facture, montant } of plan) {
        // L'entité Paiement a maintenant un getter factureId → this.facture?.id.
        // On ne set pas factureId en dur : TypeORM utilise la relation @ManyToOne.
        await paiementRepo.save(
          paiementRepo.create({
            tenant_id: tenantId,
            facture,
            montant,
            modePaiement: this.normalizePaymentMode(dto),
            status: StatutPaiement.VALIDE,
            datePaiement,
            dateValeur: datePaiement,
            reference,
            banque: (dto as any).banque?.trim() || null,
            titulaire: (dto as any).titulaire?.trim() || null,
            numeroCheque: (dto as any).numero_cheque?.trim() || null,
            notes: (dto as any).notes?.trim() || null,
          } as unknown as Partial<Paiement>),
        );
        const paidAfter = round(
          this.getValidatedPaidAmount(facture) + montant,
        );
        const totalTtc = round(Number(facture.montantTTC));
        facture.status =
          paidAfter >= totalTtc - 0.009
            ? StatutFacture.PAYEE
            : StatutFacture.PARTIELLEMENT_PAYEE;
        // `facture.paiements` a été chargé AVANT l'insert ci-dessus : le
        // passer à save() ferait croire à TypeORM que le paiement inséré a
        // été retiré de la relation → UPDATE paiements SET facture_id=NULL
        // → violation de FK (1452). On le détache le temps du save.
        const paiementsCharges = facture.paiements;
        facture.paiements = undefined as unknown as Paiement[];
        await manager.getRepository(Facture).save(facture);
        facture.paiements = paiementsCharges;
        allocations.push({
          facture_id: facture.id,
          numero: facture.numero,
          montant,
          paid_after: paidAfter,
          remaining_after: round(totalTtc - paidAfter),
          status: facture.status,
        });
      }
      const totalAllocated = round(
        allocations.reduce((sum, row) => sum + row.montant, 0),
      );
      let avoir: { id: string; numero: string; montant: number } | null = null;
      const leftover = manual ? 0 : round(autoTotal - totalAllocated);
      if (leftover > 0.009 && dto.create_avoir !== false) {
        const last = plan[plan.length - 1].facture;
        const credit = await this.factureService.createFacture(
          {
            dossierId: dossier.id,
            clientId: dossier.client?.id ?? dossier.client_id,
            type: TypeFacture.AVOIR,
            original_facture_id: last.id,
            dateFacture: datePaiement,
            dateEcheance: datePaiement,
            montantHT: -leftover,
            tauxTVA: 0,
            montantTVA: 0,
            montantTTC: -leftover,
            description: `Trop-perçu de l'encaissement ${reference} — dossier ${dossier.dossier_number}`,
            statut: StatutFacture.ENVOYEE,
          } as any,
          { manager, dossier, client: dossier.client },
        );
        avoir = { id: credit.id, numero: credit.numero, montant: leftover };
      }
      return { reference, allocations, total_allocated: totalAllocated, avoir };
    });
  }

  private getRemainingAmount(facture: Facture): number {
    const paid = this.getValidatedPaidAmount(facture);
    return (
      Math.round((Number(facture.montantTTC) - paid + Number.EPSILON) * 100) /
      100
    );
  }

  async searchPaiements(searchDto: SearchPaiementDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };

    if (
      searchDto.montant_min !== undefined ||
      searchDto.montant_max !== undefined
    ) {
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
    ]);

    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }
    if (!paiement.facture) {
      throw new NotFoundException(`Facture du paiement ${id} non trouvee`);
    }

    this.assertFactureAcceptsPayment(paiement.facture);
    this.assertNoOverpayment(
      paiement.facture,
      Number(paiement.montant),
      paiement.id,
    );

    paiement.status = StatutPaiement.VALIDE;

    const saved = await this.repository.save(paiement);
    await this.updateFactureStatus(saved.factureId);

    return saved;
  }

  async rejeterPaiement(id: string, raison: string): Promise<Paiement> {
    const paiement = await this.findOneV1(id, ['facture']);
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
    const paiement = await this.findOneV1(id, ['facture']);
    if (!paiement) {
      throw new NotFoundException(`Paiement avec l'ID ${id} non trouve`);
    }

    const factureId = paiement.factureId ?? paiement.facture?.id;
    const removed = await this.removeV1(id);

    if (factureId) {
      await this.updateFactureStatus(factureId);
    }

    return removed;
  }

  async getPaiementsEnAttente(): Promise<Paiement[]> {
    return this.findAllV1({ status: String(StatutPaiement.EN_ATTENTE) }, undefined, [
      'facture',
    ]);
  }

  async getStatistiquesPaiementsParPeriode(
    dateDebut: Date,
    dateFin: Date,
  ): Promise<any> {
    const parModeQB = this.repository
      .createQueryBuilder('paiement')
      .select('paiement.mode', 'mode')
      .addSelect('COUNT(*)', 'nombre')
      .addSelect('SUM(paiement.montant)', 'montantTotal')
      .where('paiement.datePaiement BETWEEN :dateDebut AND :dateFin', {
        dateDebut,
        dateFin,
      })
      .andWhere('paiement.statut = :statut', { statut: 'valide' })
      .groupBy('paiement.mode');
    // Isolation multi-tenant.
    addTenantCondition(parModeQB, 'paiement');
    const result = await parModeQB.getRawMany();

    const totalQB = this.repository
      .createQueryBuilder('paiement')
      .select('SUM(paiement.montant)', 'total')
      .where('paiement.datePaiement BETWEEN :dateDebut AND :dateFin', {
        dateDebut,
        dateFin,
      })
      .andWhere('paiement.statut = :statut', { statut: 'valide' });
    addTenantCondition(totalQB, 'paiement');
    const total = await totalQB.getRawOne();

    return {
      total: parseFloat(total?.total) || 0,
      parMode: result.map((row) => ({
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
      throw new BadRequestException(
        'Le montant du paiement doit etre strictement positif',
      );
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

  private normalizePaymentMode(
    dto: Partial<CreatePaiementDto> | any,
  ): ModePaiement {
    const value =
      dto.modePaiement ??
      dto.modePaiment ??
      dto.mode_paiement ??
      dto.mode ??
      ModePaiement.VIREMENT;
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
    if (Number(facture.status) === StatutFacture.ANNULEE) {
      throw new BadRequestException(
        'Impossible d enregistrer un paiement sur une facture annulee',
      );
    }
  }

  private getValidatedPaidAmount(
    facture: Facture,
    excludePaymentId?: string,
  ): number {
    return (facture.paiements ?? [])
      .filter(
        (p) => Number(p.status) === StatutPaiement.VALIDE && p.id !== excludePaymentId,
      )
      .reduce((sum, p) => sum + Number(p.montant ?? 0), 0);
  }

  private assertNoOverpayment(
    facture: Facture,
    amount: number,
    excludePaymentId?: string,
  ): void {
    const alreadyPaid = this.getValidatedPaidAmount(facture, excludePaymentId);
    const remaining = Number(facture.montantTTC) - alreadyPaid;

    if (amount > remaining + 0.01) {
      throw new BadRequestException(
        `Le montant du paiement (${amount.toFixed(2)}) depasse le reste a payer (${remaining.toFixed(2)})`,
      );
    }
  }

  private async updateFactureStatus(
    factureId: string,
  ): Promise<Facture | null> {
    const facture = await this.factureRepository.findOne({
      where: { id: factureId },
      relations: ['paiements', 'client', 'dossier'],
    });
    if (!facture) return null;
    if (Number(facture.status) === StatutFacture.ANNULEE) return facture;

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
