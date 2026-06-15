// src/facture/facture.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchCriteria, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { Like, Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { InjectRepository } from '@nestjs/typeorm';




import { DossiersService } from '../dossiers/dossiers.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { CreateFactureDto, StatutFacture } from './dto/create-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { Facture } from './entities/facture.entity';
import { InvoiceType } from '../invoice-type/entities/invoice-type.entity';
import { StepsService } from '../dossiers/step.service';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { MailService } from 'src/core/shared/emails/emails.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';








@Injectable()
export class FactureService extends BaseServiceV1<Facture> {
  constructor(
    @InjectRepository(Facture)
    protected readonly repository: Repository<Facture>,
    protected readonly paginationService: PaginationServiceV1,
    @Inject(forwardRef(() => DossiersService))  // 👈 Ajouter forwardRef
    protected readonly dossiersService: DossiersService,
    @Inject(forwardRef(() => StepsService))
    private stepsService: StepsService,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    private readonly eventEmitter: EventEmitter2,
    private readonly mailService: MailService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['numero', 'description', 'notesInternes'],
      exactMatchFields: ['id', 'dossier_id', 'client_id', 'status', 'type', 'numero'],
      dateRangeFields: ['dateFacture', 'dateEcheance', 'created_at', 'updated_at'],
      relationFields: ['paiements', 'client', 'dossier','invoice_type','subStage']
    };
  }

  async createFacture(createDto: CreateFactureDto): Promise<Facture> {
    console.log('Création de la facture avec les données suivantes  :', createDto);
    // Calcul automatique des montants si nécessaire
    if (!createDto.montantTVA) {
      createDto.montantTVA = Number(createDto.montantHT) * (Number(createDto.tauxTVA) / 100);
    }
    if (!createDto.montantTTC) {
      createDto.montantTTC = Number(createDto.montantHT) + Number(createDto.montantTVA);
    }
    const {
      clientId,
      dossierId,
      notify_client,
      numero: providedNumero,
      statut,
      ...rest
    } = createDto as CreateFactureDto & { status?: StatutFacture };
    const dossier_ = await this.dossiersService.findOne(dossierId)
    const dossier = { id: dossierId } as Dossier
    const client  =  dossier_.client
    const client_id  =  dossier_.client.id
    // Si l'utilisateur a fourni un numéro explicitement, on l'utilise tel quel.
    // Sinon, autogénération depuis app_settings (préfixe + stratégie + padding).
    let numero = providedNumero?.trim()
      ? providedNumero.trim()
      : await this.generateFacNumber()

    if (await this.invoiceNumberExists(numero)) {
      numero = await this.generateFacNumber();
    }
    let procedureInstance: ProcedureInstance | any = null;
    if (dossier_.procedureInstance) {
      // Sinon, prendre l'instance active du dossier
      procedureInstance =  dossier_.procedureInstance;
    }

    // ── Résolution du sub_stage_visit_id et stage_visit_id ───────────────────
    // Priorité : valeurs explicitement passées dans le DTO
    // Fallback  : détection automatique depuis la visite courante (sans lever d'exception)
    let subStageVisitId: string | undefined = createDto.sub_stage_visit_id;
    let stageVisitId: string | undefined = createDto.stage_visit_id;

    if (!subStageVisitId && procedureInstance?.currentVisit) {
      subStageVisitId = procedureInstance.currentVisit.currentSubStageVisitId ?? undefined;
    }
    if (!stageVisitId && procedureInstance?.currentVisit) {
      stageVisitId = procedureInstance.currentVisit.id ?? undefined;
    }

    // Lire la devise courante du cabinet pour la figer sur la facture
    const cabinet = await this.cabinetRepo.findOne({ where: { id: getCurrentTenantId() } });
    const currency = cabinet?.currency ?? 'XAF';

    const facture = this.repository.create({
      ...rest,
      dossier,
      numero,
      client,
      invoice_type: { id: createDto.type } as InvoiceType,
      client_id,
      currency,
      montantPaye: 0,
      resteAPayer: createDto.montantTTC,
      stageVisit_id: stageVisitId,
      sub_stage_visit_id: subStageVisitId,
      procedure_instance_id: procedureInstance?.id,
      status: this.normalizeStatus(rest.status ?? statut ?? StatutFacture.BROUILLON),
    });
    // Propage la case « Notifier le client » au subscriber (champ transient).
    (facture as any).notify_client = !!notify_client;

    const fac = await this.saveWithUniqueInvoiceNumber(facture);
    await this.emitStatusEventsIfNeeded(fac.id, StatutFacture.BROUILLON, fac.status);

    // const currentStep = await this.stepsService.getCurrentStep(createDto.dossierId);
    
    // // Lier la facture à l'étape (Many-to-One)
    // if (currentStep) {
    //   await this.stepsService.syncActionWithStep('facture', fac.id, currentStep.id);
    // }
    
 
    return fac
  
  }

  async updateFacture(id: string, updateDto: UpdateFactureDto): Promise<FactureResponseDto> {
    const facture = await this.findOneV1(id, ['paiements','dossier','client']);
    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${id} non trouvée`);
    }

    // Recalcul des montants si HT ou TVA changent
    if (updateDto.montantHT !== undefined || updateDto.tauxTVA !== undefined) {
      const montantHT = updateDto.montantHT ?? facture.montantHT;
      const tauxTVA = updateDto.tauxTVA ?? facture.tauxTVA;
      
      updateDto.montantTVA = montantHT * (tauxTVA / 100);
      updateDto.montantTTC = montantHT + updateDto.montantTVA;
      // updateDto.resteAPayer = updateDto.montantTTC - facture.montantPaye;
    }

    const previousStatus = facture.status;
    Object.assign(facture, updateDto);
    facture.status = this.normalizeStatus((updateDto as any).status ?? (updateDto as any).statut ?? facture.status);
    if (updateDto.notify_client !== undefined) {
      (facture as any).notify_client = !!updateDto.notify_client;
    }
    // facture.calculerResteAPayer();

    const saved = await this.repository.save(facture);
    await this.emitStatusEventsIfNeeded(saved.id, previousStatus, saved.status);
    return plainToInstance(FactureResponseDto, saved);
  }

  async searchFactures(searchDto: SearchFactureDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };
    const factures = await this.repository.find({
      relations: ['paiements', 'client', 'dossier'],
    });
    return plainToInstance(FactureResponseDto, factures);
    // Gestion des ranges de montants
    if (searchDto.montantTTC_min !== undefined || searchDto.montantTTC_max !== undefined) {
      criteria.montantTTC = [
        searchDto.montantTTC_min ?? 0,
        searchDto.montantTTC_max ?? Number.MAX_SAFE_INTEGER
      ];
    }

    return this.searchWithTransformer(
      criteria,
      FactureResponseDto,
      searchDto,
      ['paiements'],
      { created_at: 'DESC' } as any
    );
  }

  async getFacturesByDossier(dossier_id: string): Promise<Facture[]> {
    return this.findAllV1({ dossier_id }, undefined, ['paiements']);
  }

  // ─── Utilitaires montants ────────────────────────────────────────────────
  /** Total payé d'une facture (somme des paiements). */
  private computePaid(facture: Facture): number {
    return (facture.paiements ?? []).reduce(
      (sum, p) => sum + Number(p?.montant ?? 0),
      0,
    );
  }

  /** Nom affichable d'un client (raison sociale ou prénom + nom). */
  private clientLabel(client: any): string {
    if (!client) return '';
    return (
      client.company_name ||
      `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() ||
      ''
    );
  }

  // ─── EXPORT COMPTABLE (CSV) ───────────────────────────────────────────────
  /**
   * Génère un export CSV (séparateur `;`, BOM UTF-8 pour Excel) des factures
   * d'un dossier. Utilisé par les boutons « Exporter » / « Export comptable ».
   */
  async exportDossierFacturesCsv(
    dossierId: string,
  ): Promise<{ filename: string; content: string }> {
    const factures = await this.findAllV1(
      { dossier_id: dossierId },
      undefined,
      ['paiements', 'client', 'dossier'],
    );

    const STATUT_LABELS: Record<string, string> = {
      [StatutFacture.BROUILLON]: 'Brouillon',
      [StatutFacture.ENVOYEE]: 'Envoyée',
      [StatutFacture.PARTIELLEMENT_PAYEE]: 'Partiellement payée',
      [StatutFacture.PAYEE]: 'Payée',
      [StatutFacture.IMPAYEE]: 'Impayée',
      [StatutFacture.ANNULEE]: 'Annulée',
    };

    const csvEscape = (v: any): string => {
      const s = String(v ?? '').replace(/[\r\n]+/g, ' ');
      return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (v: any): string => Number(v ?? 0).toFixed(2);
    const fmtDate = (d: any): string =>
      d ? new Date(d).toLocaleDateString('fr-FR') : '';

    const header = [
      'Numéro', 'Date', 'Échéance', 'Client', 'Description',
      'Montant HT', 'TVA', 'Montant TTC', 'Payé', 'Reste', 'Statut',
    ];

    const rows = factures.map((f) => {
      const paid = this.computePaid(f);
      const reste = Number(f.montantTTC ?? 0) - paid;
      return [
        f.numero, fmtDate(f.dateFacture), fmtDate(f.dateEcheance),
        this.clientLabel(f.client), f.description,
        num(f.montantHT), num(f.montantTVA), num(f.montantTTC),
        num(paid), num(reste), STATUT_LABELS[f.status] ?? f.status,
      ];
    });

    const csv = [header, ...rows]
      .map((r) => r.map(csvEscape).join(';'))
      .join('\n');

    return {
      filename: `factures-dossier-${dossierId}.csv`,
      content: '﻿' + csv, // BOM → accents corrects dans Excel
    };
  }

  // ─── RELANCE PAR EMAIL ────────────────────────────────────────────────────
  /**
   * Envoie une relance par email au client pour les factures non soldées
   * d'un dossier. Utilisé par le bouton « Envoyer relance ».
   */
  async sendRelanceForDossier(
    dossierId: string,
  ): Promise<{ sent: boolean; count: number; to?: string; message: string }> {
    const factures = await this.findAllV1(
      { dossier_id: dossierId },
      undefined,
      ['paiements', 'client', 'dossier'],
    );

    const unpaid = factures.filter((f) => {
      const reste = Number(f.montantTTC ?? 0) - this.computePaid(f);
      return reste > 0.009 && f.status !== StatutFacture.ANNULEE;
    });

    if (unpaid.length === 0) {
      return { sent: false, count: 0, message: 'Aucune facture impayée pour ce dossier.' };
    }

    const client = unpaid[0].client as any;
    const to = client?.email;
    if (!to) {
      return {
        sent: false,
        count: unpaid.length,
        message: "Le client n'a pas d'adresse email enregistrée.",
      };
    }

    const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
    const fmtMoney = (v: any) =>
      `${Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}`;

    let totalReste = 0;
    const lignes = unpaid
      .map((f) => {
        const reste = Number(f.montantTTC ?? 0) - this.computePaid(f);
        totalReste += reste;
        return `<tr>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${f.numero}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;">${fmtDate(f.dateEcheance)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${fmtMoney(f.montantTTC)}</td>
          <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${fmtMoney(reste)}</td>
        </tr>`;
      })
      .join('');

    const dossierRef = (unpaid[0].dossier as any)?.dossier_number ?? `#${dossierId}`;
    const html =
      `<h2 style="margin-top:0;">Relance de paiement</h2>` +
      `<p>Bonjour ${this.clientLabel(client) || 'Madame, Monsieur'},</p>` +
      `<p>Sauf erreur de notre part, les factures suivantes du dossier <strong>${dossierRef}</strong> ` +
      `restent à régler :</p>` +
      `<table style="border-collapse:collapse;font-size:14px;">` +
      `<thead><tr>` +
      `<th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Numéro</th>` +
      `<th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Échéance</th>` +
      `<th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Montant TTC</th>` +
      `<th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Reste dû</th>` +
      `</tr></thead><tbody>${lignes}</tbody></table>` +
      `<p style="margin-top:12px;"><strong>Total restant dû : ${fmtMoney(totalReste)}</strong></p>` +
      `<p>Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.</p>`;

    await this.mailService.sendDirect({
      to,
      subject: `Relance de paiement — dossier ${dossierRef}`,
      html,
    });

    return {
      sent: true,
      count: unpaid.length,
      to,
      message: `Relance envoyée à ${to} (${unpaid.length} facture(s)).`,
    };
  }

  async getFacturesByClient(clientId: string): Promise<Facture[]> {
    return this.findAllV1({ clientId }, undefined, ['paiements']);
  }

  async getFacturesImpayees(): Promise<Facture[]> {
    return this.findAllV1(
      { status: StatutFacture.IMPAYEE }, 
      undefined, 
      ['paiements']
    );
  }

  async getFacturesPartiellementPayees(): Promise<Facture[]> {
    return this.findAllV1(
      { status: StatutFacture.PARTIELLEMENT_PAYEE }, 
      undefined, 
      ['paiements']
    );
  }

  async changerStatutFacture(id: string, nouveauStatus: string): Promise<Facture> {
    const facture = await this.findOneV1(id);
    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${id} non trouvée`);
    }

    const previousStatus = facture.status;
    const status = this.normalizeStatus(nouveauStatus);
    facture.status = status;
    const saved = await this.repository.save(facture);

    await this.emitStatusEventsIfNeeded(id, previousStatus, status);

    return saved;
  }

  async getChiffreAffairesParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantTTC)', 'chiffreAffaires')
      .where('facture.dateFacture BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('facture.status IN (:...statuts)', { 
        statuts: ['envoyee', 'partiellement_payee', 'payee'] 
      })
      .getRawOne();

    return parseFloat(result.chiffreAffaires) || 0;
  }

  async getMontantEncaisseParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantPaye)', 'montantEncaisse')
      .where('facture.dateFacture BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .getRawOne();

    return parseFloat(result.montantEncaisse) || 0;
  }

  async getStatistiquesPaiements(): Promise<any> {
    const totalFactures = await this.repository
      .createQueryBuilder('facture')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(facture.montantTTC)', 'totalTTC')
      .addSelect('SUM(facture.montantPaye)', 'totalPaye')
      .addSelect('SUM(facture.resteAPayer)', 'totalRestant')
      .getRawOne();

    const parStatut = await this.repository
      .createQueryBuilder('facture')
      .select('facture.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .groupBy('facture.status')
      .getRawMany();

    return {
      total: parseInt(totalFactures.total),
      totalTTC: parseFloat(totalFactures.totalTTC) || 0,
      totalPaye: parseFloat(totalFactures.totalPaye) || 0,
      totalRestant: parseFloat(totalFactures.totalRestant) || 0,
      parStatut
    };
  }

  /**
   * Génère un numéro de facture unique en suivant les settings du cabinet.
   *
   * Lit cabinets.invoice_prefix / invoice_padding / invoice_numbering_strategy
   * puis cherche le MAX existant pour la fenêtre choisie (année, mois ou global)
   * et incrémente. Une boucle de sécurité parcourt les éventuelles collisions.
   *
   * Formats produits selon la stratégie :
   *   yearly     →  FAC-2026-0001
   *   monthly    →  FAC-202605-0001
   *   continuous →  FAC-0001
   *
   * Si aucun cabinet n'existe (pas encore configuré), retombe sur
   * un format minimal sécurisé : `${prefix}${YYYY}-0001`.
   */
  async generateFacNumber(): Promise<string> {
    const settings = await this.cabinetRepo.findOne({ where: { id: getCurrentTenantId() } });
    const prefix  = (settings?.invoice_prefix ?? 'FAC-').toString();
    const padding = Math.max(1, Math.min(10, settings?.invoice_padding ?? 4));
    // Gabarit : "{PREFIX}{YYYY}-{NNNN}" par défaut (rétro-compatible)
    const template = (settings?.invoice_number_format ?? '{PREFIX}{YYYY}-{NNNN}').toString();

    const now  = new Date();
    const YYYY = now.getFullYear().toString();
    const MM   = (now.getMonth() + 1).toString().padStart(2, '0');

    /**
     * On détermine le "scope de recherche" : la partie fixe du numéro avant
     * le compteur, afin de trouver le dernier numéro existant et en extraire
     * la séquence.
     * Le compteur est toujours le jeton {NNNN}, on construit donc le préfixe
     * de recherche en remplaçant tous les jetons SAUF {NNNN}.
     */
    const searchPrefix = template
      .replace('{PREFIX}', prefix)
      .replace('{YYYY}',   YYYY)
      .replace('{MM}',     MM)
      .replace('{NNNN}',   ''); // sera complété par le compteur

    const last = await this.repository
      .createQueryBuilder('f')
      .withDeleted()
      .where('f.numero LIKE :pfx', { pfx: `${searchPrefix}%` })
      .orderBy('f.numero', 'DESC')
      .getOne();

    let nextSeq = 1;
    if (last?.numero) {
      const tail  = last.numero.slice(searchPrefix.length);
      const match = tail.match(/^(\d+)/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }

    const buildNumero = (seq: number) =>
      template
        .replace('{PREFIX}', prefix)
        .replace('{YYYY}',   YYYY)
        .replace('{MM}',     MM)
        .replace('{NNNN}',   seq.toString().padStart(padding, '0'));

    let numero = buildNumero(nextSeq);

    // Filet anti-collision (race conditions, soft-deletes, etc.)
    let safety = 0;
    while (safety++ < 100) {
      const existing = await this.repository.findOne({ where: { numero }, withDeleted: true });
      if (!existing) break;
      nextSeq++;
      numero = buildNumero(nextSeq);
    }

    return numero;
  }

  private async invoiceNumberExists(numero: string): Promise<boolean> {
    const existing = await this.repository.findOne({ where: { numero }, withDeleted: true });
    return !!existing;
  }

  private isDuplicateInvoiceNumberError(error: any): boolean {
    return (
      error?.code === 'ER_DUP_ENTRY' &&
      (String(error?.message ?? '').includes('numero') ||
        String(error?.message ?? '').includes('IDX_f1c7842d8a90f22a49d66639d0'))
    );
  }

  private async saveWithUniqueInvoiceNumber(facture: Facture): Promise<Facture> {
    let attempt = 0;
    while (attempt++ < 5) {
      try {
        return await this.repository.save(facture);
      } catch (error) {
        if (!this.isDuplicateInvoiceNumberError(error)) throw error;
        facture.numero = await this.generateFacNumber();
      }
    }
    return this.repository.save(facture);
  }

  private normalizeStatus(value: string | number | StatutFacture): StatutFacture {
    if (typeof value === 'number') return value as StatutFacture;

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as StatutFacture;

    const labels: Record<string, StatutFacture> = {
      brouillon: StatutFacture.BROUILLON,
      envoyee: StatutFacture.ENVOYEE,
      envoyée: StatutFacture.ENVOYEE,
      partiellement_payee: StatutFacture.PARTIELLEMENT_PAYEE,
      partiellement_payée: StatutFacture.PARTIELLEMENT_PAYEE,
      payee: StatutFacture.PAYEE,
      payée: StatutFacture.PAYEE,
      impayee: StatutFacture.IMPAYEE,
      impayée: StatutFacture.IMPAYEE,
      annulee: StatutFacture.ANNULEE,
      annulée: StatutFacture.ANNULEE,
    };

    return labels[String(value).toLowerCase()] ?? (value as unknown as StatutFacture);
  }

  private isBillableStatus(status: StatutFacture): boolean {
    return [
      StatutFacture.ENVOYEE,
      StatutFacture.PARTIELLEMENT_PAYEE,
      StatutFacture.PAYEE,
      StatutFacture.IMPAYEE,
    ].includes(status);
  }

  private async emitStatusEventsIfNeeded(
    factureId: string,
    previousStatus: StatutFacture,
    nextStatus: StatutFacture,
  ): Promise<void> {
    if (previousStatus === nextStatus) return;

    const full = await this.findOneV1(factureId, ['client']);

    if (this.isBillableStatus(nextStatus)) {
      this.eventEmitter.emit('facture.envoyee', full);
      return;
    }

    if (nextStatus === StatutFacture.ANNULEE) {
      this.eventEmitter.emit('facture.annulee', full);
    }
  }
}
