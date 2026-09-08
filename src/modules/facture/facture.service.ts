// src/facture/facture.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchCriteria, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { EntityManager, Like, Repository } from 'typeorm';
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';




import { DossiersService } from '../dossiers/dossiers.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { CreateFactureDto, StatutFacture } from './dto/create-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { Facture } from './entities/facture.entity';
import { InvoiceType, InvoiceTypeCategory } from '../invoice-type/entities/invoice-type.entity';
import { StepsService } from '../dossiers/step.service';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { MailService } from 'src/core/shared/emails/emails.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';








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
    @InjectRepository(InvoiceType)
    private readonly invoiceTypeRepo: Repository<InvoiceType>,
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

  /**
   * `Facture.type` est une classification historique (0..3), pas la clé
   * primaire de `invoice_types`. L'ancienne implémentation utilisait pourtant
   * cette valeur comme ID de relation, ce qui produisait une violation de FK
   * dès que les IDs du catalogue ne correspondaient pas à 0..3.
   */
  private async resolveInvoiceType(
    type: CreateFactureDto['type'],
    manager?: EntityManager,
  ): Promise<InvoiceType | null> {
    const repository = manager?.getRepository(InvoiceType) ?? this.invoiceTypeRepo;
    const tenantId = getCurrentTenantId();
    const preferredCode = {
      0: 'HON_PROCEDURE',
      1: 'FRAIS_DOSSIER',
      2: 'HON_PROCEDURE',
      3: 'AUTRES_FRAIS',
      4: 'AVOIR',
    }[Number(type)];

    if (preferredCode) {
      const preferred = await repository.createQueryBuilder('invoiceType')
        .where('invoiceType.code = :preferredCode', { preferredCode })
        .andWhere('invoiceType.is_active = :active', { active: true })
        .andWhere('(invoiceType.tenant_id = :tenantId OR invoiceType.tenant_id = 1)', { tenantId })
        .orderBy('CASE WHEN invoiceType.tenant_id = :tenantId THEN 0 ELSE 1 END', 'ASC')
        .setParameter('tenantId', tenantId)
        .getOne();
      if (preferred) return preferred;
    }

    const category = Number(type) === 1
      ? InvoiceTypeCategory.EXPENSES
      : [3, 4].includes(Number(type))
        ? InvoiceTypeCategory.OTHER
        : InvoiceTypeCategory.LEGAL_FEES;
    return repository.createQueryBuilder('invoiceType')
      .where('invoiceType.category = :category', { category })
      .andWhere('invoiceType.is_active = :active', { active: true })
      .andWhere('(invoiceType.tenant_id = :tenantId OR invoiceType.tenant_id = 1)', { tenantId })
      .orderBy('CASE WHEN invoiceType.tenant_id = :tenantId THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('invoiceType.id', 'ASC')
      .setParameter('tenantId', tenantId)
      .getOne();
  }

  async createFacture(
    createDto: CreateFactureDto,
    options: {
      manager?: EntityManager;
      dossier?: Dossier | any;
      client?: Customer | any;
    } = {},
  ): Promise<Facture> {
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
      original_facture_id,
      ...rest
    } = createDto as CreateFactureDto & { status?: StatutFacture };
    const dossier_ = options.dossier ?? await (
      options.manager
        ? options.manager.findOne(Dossier, {
            where: { id: dossierId as any },
            relations: ['client', 'procedureInstance', 'procedureInstance.currentVisit'],
          })
        : this.dossiersService.findOne(dossierId)
    );
    if (!dossier_) {
      throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
    }
    const dossier = { id: dossierId } as Dossier
    const client = options.client ?? dossier_.client;
    const client_id = client?.id ?? clientId;
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
    const invoiceType = await this.resolveInvoiceType(createDto.type, options.manager);

    const facture = this.repository.create({
      ...rest,
      dossier,
      numero,
      client,
      // La relation est nullable : un cabinet dont le catalogue n'est pas
      // encore seedé peut créer la facture sans fabriquer une fausse FK.
      invoice_type: invoiceType ?? undefined,
      original_facture_id: original_facture_id ?? null,
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

    const fac = await this.saveWithUniqueInvoiceNumber(facture, options.manager);

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

    Object.assign(facture, updateDto);
    facture.status = this.normalizeStatus((updateDto as any).status ?? (updateDto as any).statut ?? facture.status);
    if (updateDto.notify_client !== undefined) {
      (facture as any).notify_client = !!updateDto.notify_client;
    }
    // facture.calculerResteAPayer();

    const saved = await this.repository.save(facture);
    return plainToInstance(FactureResponseDto, saved);
  }

  async searchFactures(searchDto: SearchFactureDto): Promise<any> {
    const criteria: SearchCriteria = { ...searchDto };
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
      ['paiements', 'client', 'dossier'],
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

  /** Encode une valeur métier avant de l'insérer dans le corps HTML d'un e-mail. */
  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Envoie une facture au client, puis la marque comme envoyée si elle était
   * encore au brouillon. Le statut n'est modifié qu'après le succès SMTP.
   */
  async sendFactureByEmail(
    id: string,
    recipientOverride?: string,
  ): Promise<{ sent: true; to: string; message: string }> {
    const facture = await this.findOneV1(id, [
      'paiements',
      'client',
      'dossier',
    ]);
    if (!facture) {
      throw new NotFoundException(`Facture avec l'ID ${id} non trouvée`);
    }

    const client = facture.client as any;
    const to = (recipientOverride || client?.email || '').trim();
    if (!to) {
      throw new BadRequestException(
        "Aucune adresse e-mail n'est renseignée pour le client de cette facture.",
      );
    }

    const cabinet = await this.cabinetRepo.findOne({
      where: { id: getCurrentTenantId() },
    });
    const currency =
      facture.currency && facture.currency !== cabinet?.currency
        ? facture.currency
        : (cabinet?.currency_symbol ??
          facture.currency ??
          cabinet?.currency ??
          'XAF');
    const decimals = cabinet?.currency_decimals ?? 0;
    const fmtMoney = (value: unknown): string =>
      `${Number(value ?? 0).toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })} ${currency}`;
    const fmtDate = (value: unknown): string =>
      value
        ? new Date(value as string | number | Date).toLocaleDateString('fr-FR')
        : '';

    const paid = this.computePaid(facture);
    const remaining = Math.max(0, Number(facture.montantTTC ?? 0) - paid);
    const clientName = this.escapeHtml(
      this.clientLabel(client) || 'Madame, Monsieur',
    );
    const dossierRef = this.escapeHtml(
      (facture.dossier as any)?.dossier_number ?? `#${facture.dossier_id}`,
    );
    const cabinetName = this.escapeHtml(cabinet?.name ?? 'Votre cabinet');

    const html =
      `<h2 style="margin-top:0;">Facture ${this.escapeHtml(facture.numero)}</h2>` +
      `<p>Bonjour ${clientName},</p>` +
      `<p>Veuillez trouver ci-dessous les informations de votre facture ` +
      `relative au dossier <strong>${dossierRef}</strong>.</p>` +
      `<table style="border-collapse:collapse;font-size:14px;">` +
      `<tbody>` +
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Numéro</td>` +
      `<td style="padding:6px 10px;border:1px solid #e5e7eb;">${this.escapeHtml(facture.numero)}</td></tr>` +
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Date</td>` +
      `<td style="padding:6px 10px;border:1px solid #e5e7eb;">${fmtDate(facture.dateFacture)}</td></tr>` +
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Échéance</td>` +
      `<td style="padding:6px 10px;border:1px solid #e5e7eb;">${fmtDate(facture.dateEcheance)}</td></tr>` +
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Montant TTC</td>` +
      `<td style="padding:6px 10px;border:1px solid #e5e7eb;">${fmtMoney(facture.montantTTC)}</td></tr>` +
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Reste à payer</td>` +
      `<td style="padding:6px 10px;border:1px solid #e5e7eb;">${fmtMoney(remaining)}</td></tr>` +
      `</tbody></table>` +
      `<p>Pour toute question, vous pouvez contacter ${cabinetName}.</p>`;

    await this.mailService.sendDirect({
      to,
      subject: `Facture ${facture.numero} — ${cabinet?.name ?? 'Votre cabinet'}`,
      html,
    });

    if (Number(facture.status) === StatutFacture.BROUILLON) {
      facture.status = StatutFacture.ENVOYEE;
      await this.repository.save(facture);
    }

    return {
      sent: true,
      to,
      message: `Facture ${facture.numero} envoyée à ${to}.`,
    };
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
    return this.findAllV1({ client_id: clientId }, undefined, ['paiements', 'client', 'dossier']);
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

    const status = this.normalizeStatus(nouveauStatus);
    if (status === StatutFacture.ANNULEE && facture.status !== StatutFacture.BROUILLON) {
      throw new BadRequestException(
        'Une facture émise ne peut pas être annulée directement. Créez un avoir ou une ligne d’ajustement liée à l’original.',
      );
    }
    facture.status = status;
    const saved = await this.repository.save(facture);

    return saved;
  }

  async getChiffreAffairesParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const qb = this.repository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantTTC)', 'chiffreAffaires')
      .where('facture.dateFacture BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin })
      .andWhere('facture.status IN (:...statuts)', {
        statuts: ['envoyee', 'partiellement_payee', 'payee']
      });
    addTenantCondition(qb, 'facture');
    const result = await qb.getRawOne();

    return parseFloat(result.chiffreAffaires) || 0;
  }

  async getMontantEncaisseParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const qb = this.repository
      .createQueryBuilder('facture')
      .select('SUM(facture.montantPaye)', 'montantEncaisse')
      .where('facture.dateFacture BETWEEN :dateDebut AND :dateFin', { dateDebut, dateFin });
    addTenantCondition(qb, 'facture');
    const result = await qb.getRawOne();

    return parseFloat(result.montantEncaisse) || 0;
  }

  async getStatistiquesPaiements(): Promise<any> {
    const totalQB = this.repository
      .createQueryBuilder('facture')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(facture.montantTTC)', 'totalTTC')
      .addSelect('SUM(facture.montantPaye)', 'totalPaye')
      .addSelect('SUM(facture.resteAPayer)', 'totalRestant');
    addTenantCondition(totalQB, 'facture');
    const totalFactures = await totalQB.getRawOne();

    const parStatutQB = this.repository
      .createQueryBuilder('facture')
      .select('facture.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .groupBy('facture.status');
    addTenantCondition(parStatutQB, 'facture');
    const parStatut = await parStatutQB.getRawMany();

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

    const lastQB = this.repository
      .createQueryBuilder('f')
      .withDeleted()
      .where('f.numero LIKE :pfx', { pfx: `${searchPrefix}%` })
      .orderBy('f.numero', 'DESC');
    addTenantCondition(lastQB, 'f');
    const last = await lastQB.getOne();

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

  private async saveWithUniqueInvoiceNumber(
    facture: Facture,
    manager?: EntityManager,
  ): Promise<Facture> {
    const repo = manager?.getRepository(Facture) ?? this.repository;
    let attempt = 0;
    while (attempt++ < 5) {
      try {
        return await repo.save(facture);
      } catch (error) {
        if (!this.isDuplicateInvoiceNumberError(error)) throw error;
        facture.numero = await this.generateFacNumber();
      }
    }
    return repo.save(facture);
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

}
