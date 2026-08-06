// src/facture/facture.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchCriteria, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { DataSource, EntityManager, Like, Repository } from 'typeorm';
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';




import { DossiersService } from '../dossiers/dossiers.service';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import {
  CreateFactureDto,
  InvoiceNature,
  InvoiceSettlementDisposition,
  StatutFacture,
} from './dto/create-facture.dto';
import { FactureResponseDto } from './dto/facture-response.dto';
import { SearchFactureDto } from './dto/search-facture.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { Facture } from './entities/facture.entity';
import { InvoiceType } from '../invoice-type/entities/invoice-type.entity';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { MailService } from 'src/core/shared/emails/emails.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { Paiement } from '../paiement/entities/paiement.entity';
import { StatutPaiement } from '../paiement/dto/create-paiement.dto';
import { createHash } from 'crypto';
import { CreateCreditNoteDto } from './dto/credit-note.dto';

export interface InvoiceActor {
  id?: number;
  userId?: number;
}








@Injectable()
export class FactureService extends BaseServiceV1<Facture> {
  constructor(
    @InjectRepository(Facture)
    protected readonly repository: Repository<Facture>,
    protected readonly paginationService: PaginationServiceV1,
    @Inject(forwardRef(() => DossiersService))  // 👈 Ajouter forwardRef
    protected readonly dossiersService: DossiersService,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
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

  async createFacture(
    createDto: CreateFactureDto,
    options: {
      manager?: EntityManager;
      dossier?: Dossier | any;
      client?: Customer | any;
      allowCreditNote?: boolean;
      originalInvoiceId?: string | null;
      actor?: InvoiceActor;
    } = {},
  ): Promise<Facture> {
    if (!options.manager) {
      return this.dataSource.transaction('SERIALIZABLE', (manager) =>
        this.createFacture(createDto, { ...options, manager }),
      );
    }
    const requestedNature =
      createDto.nature ?? InvoiceNature.STANDARD;
    if (
      requestedNature === InvoiceNature.CREDIT_NOTE &&
      !options.allowCreditNote
    ) {
      throw new BadRequestException(
        'Un avoir se crée uniquement depuis la commande dédiée de la facture d’origine',
      );
    }
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
      nature,
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
    if (requestedNature === InvoiceNature.FINAL) {
      await options.manager.query(
        `SELECT id
         FROM dossiers
         WHERE id = ? AND tenant_id = ?
         FOR UPDATE`,
        [dossierId, getCurrentTenantId()],
      );
      const finalInvoice = await (
        options.manager?.getRepository(Facture) ?? this.repository
      )
        .createQueryBuilder('invoice')
        .where('invoice.tenant_id = :tenantId', {
          tenantId: getCurrentTenantId(),
        })
        .andWhere('invoice.dossier_id = :dossierId', { dossierId })
        .andWhere('invoice.nature = :nature', {
          nature: InvoiceNature.FINAL,
        })
        .andWhere('invoice.status != :cancelled', {
          cancelled: StatutFacture.ANNULEE,
        })
        .andWhere('invoice.deleted_at IS NULL')
        .getOne();
      if (finalInvoice) {
        throw new BadRequestException(
          `Le dossier possède déjà une facture finale (${finalInvoice.numero})`,
        );
      }
    }
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
      status: StatutFacture.BROUILLON,
      nature: requestedNature,
      originalInvoiceId: options.originalInvoiceId ?? null,
      settlementDisposition: InvoiceSettlementDisposition.NONE,
      dispositionReason: null,
      dispositionAt: null,
      dispositionBy: null,
      notifyClientRequested: Boolean(notify_client),
    });
    // Propage la case « Notifier le client » au subscriber (champ transient).
    (facture as any).notify_client = !!notify_client;

    const fac = await this.saveWithUniqueInvoiceNumber(facture, options.manager);
    if (requestedNature !== InvoiceNature.CREDIT_NOTE) {
      const audit = await this.auditService.append(options.manager, {
        actorId: options.actor?.userId ?? options.actor?.id ?? null,
        action: 'invoice.draft_created',
        resourceType: 'invoice',
        resourceId: fac.id,
        dossierId: fac.dossier_id,
        afterState: {
          status: fac.status,
          nature: fac.nature,
          numero: fac.numero,
          amount: fac.montantTTC,
        },
      });
      await this.outboxService.enqueue(options.manager, {
        eventType: 'invoice.draft_created',
        aggregateType: 'invoice',
        aggregateId: fac.id,
        idempotencyKey: `invoice-draft-created:${audit.id}`,
        payload: this.invoiceEventPayload(fac),
      });
    }
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

    if (
      (updateDto as any).status !== undefined ||
      (updateDto as any).statut !== undefined
    ) {
      throw new BadRequestException(
        'Le statut de la facture se modifie uniquement par une commande métier dédiée',
      );
    }
    if (
      updateDto.dossierId !== undefined ||
      updateDto.clientId !== undefined ||
      updateDto.stage_visit_id !== undefined ||
      updateDto.sub_stage_visit_id !== undefined
    ) {
      throw new BadRequestException(
        "Le dossier, le client et les visites procédurales d'une facture sont immuables",
      );
    }
    if (updateDto.numero !== undefined) {
      throw new BadRequestException(
        "Le numéro d'une facture est attribué à la création et ne peut pas être modifié",
      );
    }
    if (updateDto.nature !== undefined) {
      throw new BadRequestException(
        "La nature d'une facture est fixée à la création",
      );
    }
    if (facture.status !== StatutFacture.BROUILLON) {
      throw new BadRequestException(
        'Une facture émise ou validée est immuable ; créez un avoir ou annulez-la',
      );
    }

    // Recalcul des montants si HT ou TVA changent
    if (updateDto.montantHT !== undefined || updateDto.tauxTVA !== undefined) {
      const montantHT = updateDto.montantHT ?? facture.montantHT;
      const tauxTVA = updateDto.tauxTVA ?? facture.tauxTVA;
      
      updateDto.montantTVA = montantHT * (tauxTVA / 100);
      updateDto.montantTTC = montantHT + updateDto.montantTVA;
      // updateDto.resteAPayer = updateDto.montantTTC - facture.montantPaye;
    }

    const editableFields = { ...updateDto };
    delete editableFields.dossierId;
    delete editableFields.clientId;
    delete editableFields.stage_visit_id;
    delete editableFields.sub_stage_visit_id;
    delete editableFields.numero;
    delete editableFields.statut;
    delete editableFields.nature;
    Object.assign(facture, editableFields);
    facture.status = StatutFacture.BROUILLON;
    if (updateDto.notify_client !== undefined) {
      (facture as any).notify_client = !!updateDto.notify_client;
    }
    // facture.calculerResteAPayer();

    const saved = await this.repository.save(facture);
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

  async getInvoiceDossierId(id: string): Promise<number> {
    const facture = await this.repository.findOne({
      where: { id },
      select: ['id', 'dossier_id'],
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    return facture.dossier_id;
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
      [StatutFacture.ANNULEE]: 'Annulée',
      [StatutFacture.VALIDEE]: 'Validée',
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
      return (
        reste > 0.009 &&
        [StatutFacture.VALIDEE, StatutFacture.PARTIELLEMENT_PAYEE].includes(
          f.status,
        ) &&
        f.nature !== InvoiceNature.CREDIT_NOTE
      );
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
    return this.findAllV1(
      { client_id: Number(clientId) },
      undefined,
      ['paiements', 'dossier'],
    );
  }

  async getFacturesImpayees(): Promise<Facture[]> {
    return this.repository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.paiements', 'payment')
      .where('invoice.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('invoice.date_echeance < CURRENT_DATE()')
      .andWhere('invoice.status IN (:...statuses)', {
        statuses: [
          StatutFacture.VALIDEE,
          StatutFacture.PARTIELLEMENT_PAYEE,
        ],
      })
      .andWhere('invoice.nature != :creditNote', {
        creditNote: InvoiceNature.CREDIT_NOTE,
      })
      .getMany();
  }

  async getFacturesPartiellementPayees(): Promise<Facture[]> {
    return this.findAllV1(
      { status: StatutFacture.PARTIELLEMENT_PAYEE }, 
      undefined, 
      ['paiements']
    );
  }

  async issueInvoice(
    id: string,
    actor: InvoiceActor = {},
  ): Promise<Facture> {
    return this.transitionInvoice(
      id,
      StatutFacture.BROUILLON,
      StatutFacture.ENVOYEE,
      'invoice.issued',
      actor,
    );
  }

  async validateInvoice(
    id: string,
    actor: InvoiceActor = {},
  ): Promise<Facture> {
    const invoice = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      select: ['id', 'nature'],
    });
    if (!invoice) throw new NotFoundException('Facture introuvable');
    if (invoice.nature === InvoiceNature.CREDIT_NOTE) {
      return this.validateCreditNote(id, actor);
    }
    return this.transitionInvoice(
      id,
      StatutFacture.ENVOYEE,
      StatutFacture.VALIDEE,
      'invoice.validated',
      actor,
    );
  }

  async createCreditNote(
    originalInvoiceId: string,
    dto: CreateCreditNoteDto,
    actor: InvoiceActor = {},
  ): Promise<Facture> {
    const reason = dto.raison?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Un motif explicite d’au moins 10 caractères est obligatoire',
      );
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const original = await this.lockInvoice(manager, originalInvoiceId);
      if (original.nature === InvoiceNature.CREDIT_NOTE) {
        throw new BadRequestException('Un avoir ne peut pas porter un autre avoir');
      }
      if (
        ![
          StatutFacture.VALIDEE,
          StatutFacture.PARTIELLEMENT_PAYEE,
          StatutFacture.PAYEE,
        ].includes(original.status)
      ) {
        throw new BadRequestException(
          'Un avoir exige une facture validée, partiellement payée ou payée',
        );
      }
      const htMinor = this.toMinorUnits(dto.montantHT, false);
      const vatMinor = this.toMinorUnits(dto.montantTVA, true);
      const totalMinor = this.toMinorUnits(dto.montantTTC, false);
      if (htMinor + vatMinor !== totalMinor) {
        throw new BadRequestException(
          'Les montants HT, TVA et TTC de l’avoir sont incohérents',
        );
      }
      const existingRows = await manager.query(
        `SELECT id, montant_ttc AS amount, status
         FROM factures
         WHERE tenant_id = ?
           AND original_invoice_id = ?
           AND status <> ?
           AND deleted_at IS NULL
         FOR UPDATE`,
        [
          getCurrentTenantId(),
          original.id,
          StatutFacture.ANNULEE,
        ],
      );
      const alreadyCreditedMinor = existingRows.reduce(
        (sum: number, row: any) =>
          sum + this.toMinorUnits(row.amount, false),
        0,
      );
      const originalMinor = this.toMinorUnits(original.montantTTC, false);
      if (alreadyCreditedMinor + totalMinor > originalMinor) {
        throw new BadRequestException(
          'Le cumul des avoirs dépasserait le montant de la facture d’origine',
        );
      }
      const paidMinor = await this.validatedPaymentsMinor(
        manager,
        original.id,
      );
      if (paidMinor > originalMinor - alreadyCreditedMinor - totalMinor) {
        throw new BadRequestException(
          'Cet avoir créerait un trop-perçu ; traitez d’abord le remboursement',
        );
      }
      const date = dto.dateFacture ?? new Date();
      const credit = await this.createFacture(
        {
          dossierId: original.dossier_id,
          clientId: original.client_id,
          type: original.type,
          nature: InvoiceNature.CREDIT_NOTE,
          dateFacture: date,
          dateEcheance: date,
          montantHT: dto.montantHT,
          tauxTVA: dto.tauxTVA,
          montantTVA: dto.montantTVA,
          montantTTC: dto.montantTTC,
          description: `Avoir sur ${original.numero} — ${reason}`,
          notesInternes: reason,
        },
        {
          manager,
          dossier: {
            id: original.dossier_id,
            client: { id: original.client_id },
          },
          client: { id: original.client_id },
          allowCreditNote: true,
          originalInvoiceId: original.id,
        },
      );
      const audit = await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action: 'invoice.credit_note.created',
        resourceType: 'invoice',
        resourceId: credit.id,
        dossierId: credit.dossier_id,
        afterState: {
          status: credit.status,
          nature: credit.nature,
          originalInvoiceId: original.id,
          amount: credit.montantTTC,
        },
        justification: reason,
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'invoice.credit_note.created',
        aggregateType: 'invoice',
        aggregateId: credit.id,
        idempotencyKey: `invoice-credit-note-created:${audit.id}`,
        payload: this.invoiceEventPayload(credit, {
          originalInvoiceId: original.id,
          reason,
        }),
      });
      return credit;
    });
  }

  async waiveInvoice(
    id: string,
    reason: string,
    actor: InvoiceActor = {},
  ): Promise<Facture> {
    return this.applyDisposition(
      id,
      InvoiceSettlementDisposition.WAIVED,
      reason,
      actor,
    );
  }

  async markBadDebt(
    id: string,
    reason: string,
    actor: InvoiceActor = {},
  ): Promise<Facture> {
    return this.applyDisposition(
      id,
      InvoiceSettlementDisposition.BAD_DEBT,
      reason,
      actor,
    );
  }

  async cancelInvoice(
    id: string,
    rawReason: string,
    actor: InvoiceActor = {},
  ): Promise<Facture> {
    const reason = rawReason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Un motif explicite d’au moins 10 caractères est obligatoire',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const facture = await this.lockInvoice(manager, id);
      if (
        facture.nature === InvoiceNature.CREDIT_NOTE &&
        facture.status === StatutFacture.VALIDEE
      ) {
        throw new BadRequestException(
          'Un avoir validé est immuable ; sa correction exige un document comptable inverse',
        );
      }
      if (
        ![
          StatutFacture.BROUILLON,
          StatutFacture.ENVOYEE,
          StatutFacture.VALIDEE,
        ].includes(facture.status)
      ) {
        throw new BadRequestException(
          'Cette facture ne peut plus être annulée directement ; utilisez un avoir ou une contrepassation',
        );
      }
      const validatedPayments = await manager.getRepository(Paiement).count({
        where: {
          factureId: facture.id,
          tenant_id: getCurrentTenantId(),
          status: StatutPaiement.VALIDE,
        },
      });
      if (validatedPayments > 0) {
        throw new BadRequestException(
          'Une facture encaissée ne peut pas être annulée directement',
        );
      }
      const previousStatus = facture.status;
      facture.status = StatutFacture.ANNULEE;
      const saved = await manager.getRepository(Facture).save(facture);
      const audit = await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action: 'invoice.cancelled',
        resourceType: 'invoice',
        resourceId: saved.id,
        dossierId: saved.dossier_id,
        beforeState: { status: previousStatus },
        afterState: { status: saved.status },
        justification: reason,
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'invoice.cancelled',
        aggregateType: 'invoice',
        aggregateId: saved.id,
        idempotencyKey: `invoice-cancelled:${audit.id}`,
        payload: this.invoiceEventPayload(saved, {
          reason,
          previousStatus,
        }),
      });
      return saved;
    });
  }

  async removeInvoice(): Promise<never> {
    throw new BadRequestException(
      'La suppression d’une facture est interdite ; utilisez la commande d’annulation',
    );
  }

  async changerStatutFacture(id: string, nouveauStatus: string): Promise<Facture> {
    throw new BadRequestException(
      'Le changement générique de statut est interdit ; utilisez issue, validate ou cancel',
    );
  }

  async getChiffreAffairesParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN nature = ? AND status = ? THEN -montant_ttc
           WHEN nature <> ? AND status IN (?, ?, ?) THEN montant_ttc
           ELSE 0
         END
       ), 0) AS chiffreAffaires
       FROM factures
       WHERE tenant_id = ?
         AND date_facture BETWEEN ? AND ?
         AND deleted_at IS NULL`,
      [
        InvoiceNature.CREDIT_NOTE,
        StatutFacture.VALIDEE,
        InvoiceNature.CREDIT_NOTE,
        StatutFacture.VALIDEE,
        StatutFacture.PARTIELLEMENT_PAYEE,
        StatutFacture.PAYEE,
        getCurrentTenantId(),
        dateDebut,
        dateFin,
      ],
    );
    return Number(rows?.[0]?.chiffreAffaires ?? 0);
  }

  async getMontantEncaisseParPeriode(dateDebut: Date, dateFin: Date): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM(p.montant), 0) AS montantEncaisse
       FROM paiements p
       INNER JOIN factures f
         ON f.id = p.facture_id AND f.tenant_id = p.tenant_id
       WHERE p.tenant_id = ?
         AND p.status = ?
         AND p.date_paiement BETWEEN ? AND ?
         AND p.deleted_at IS NULL
         AND f.deleted_at IS NULL`,
      [
        getCurrentTenantId(),
        StatutPaiement.VALIDE,
        dateDebut,
        dateFin,
      ],
    );
    return Number(rows?.[0]?.montantEncaisse ?? 0);
  }

  async getStatistiquesPaiements(): Promise<any> {
    const tenantId = getCurrentTenantId();
    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(
           CASE
             WHEN f.nature = ? AND f.status = ? THEN -f.montant_ttc
             WHEN f.nature <> ? AND f.status IN (?, ?, ?)
               THEN f.montant_ttc
             ELSE 0
           END
         ), 0) AS totalTTC,
         COALESCE((
           SELECT SUM(p.montant)
           FROM paiements p
           WHERE p.tenant_id = ?
             AND p.status = ?
             AND p.deleted_at IS NULL
         ), 0) AS totalPaye,
         COALESCE(SUM(
           CASE
             WHEN f.nature <> ? AND f.status IN (?, ?)
             THEN GREATEST(
               f.montant_ttc
               - COALESCE((
                   SELECT SUM(p2.montant)
                   FROM paiements p2
                   WHERE p2.tenant_id = f.tenant_id
                     AND p2.facture_id = f.id
                     AND p2.status = ?
                     AND p2.deleted_at IS NULL
                 ), 0)
               - COALESCE((
                   SELECT SUM(c.montant_ttc)
                   FROM factures c
                   WHERE c.tenant_id = f.tenant_id
                     AND c.original_invoice_id = f.id
                     AND c.nature = ?
                     AND c.status = ?
                     AND c.deleted_at IS NULL
                 ), 0),
               0
             )
             ELSE 0
           END
         ), 0) AS totalRestant
       FROM factures f
       WHERE f.tenant_id = ? AND f.deleted_at IS NULL`,
      [
        InvoiceNature.CREDIT_NOTE,
        StatutFacture.VALIDEE,
        InvoiceNature.CREDIT_NOTE,
        StatutFacture.VALIDEE,
        StatutFacture.PARTIELLEMENT_PAYEE,
        StatutFacture.PAYEE,
        tenantId,
        StatutPaiement.VALIDE,
        InvoiceNature.CREDIT_NOTE,
        StatutFacture.VALIDEE,
        StatutFacture.PARTIELLEMENT_PAYEE,
        StatutPaiement.VALIDE,
        InvoiceNature.CREDIT_NOTE,
        StatutFacture.VALIDEE,
        tenantId,
      ],
    );
    const totalFactures = rows?.[0] ?? {};

    const parStatut = await this.repository
      .createQueryBuilder('facture')
      .select('facture.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(facture.montantTTC)', 'montantTotal')
      .where('facture.tenant_id = :tenantId', { tenantId })
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
   * puis réserve atomiquement la séquence dans une table verrouillée par
   * cabinet et par périmètre de numérotation.
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

    const tenantId = getCurrentTenantId();
    const scopeDescriptor = [
      prefix,
      template,
      template.includes('{YYYY}') ? YYYY : 'ALL_YEARS',
      template.includes('{MM}') ? MM : 'ALL_MONTHS',
    ].join('|');
    const scopeKey = createHash('sha256')
      .update(scopeDescriptor)
      .digest('hex');
    const searchPrefix = template
      .replace('{PREFIX}', prefix)
      .replace('{YYYY}', YYYY)
      .replace('{MM}', MM)
      .replace('{NNNN}', '');
    const nextSeq = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT IGNORE INTO invoice_number_sequences
           (tenant_id, scope_key, next_value)
         VALUES (?, ?, 1)`,
        [tenantId, scopeKey],
      );
      const rows = await manager.query(
        `SELECT next_value
         FROM invoice_number_sequences
         WHERE tenant_id = ? AND scope_key = ?
         FOR UPDATE`,
        [tenantId, scopeKey],
      );
      let sequence = Number(rows?.[0]?.next_value);
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new BadRequestException(
          'La séquence de facturation est invalide',
        );
      }
      const existingRows = await manager.query(
        `SELECT numero
         FROM factures
         WHERE tenant_id = ? AND numero LIKE ?
         ORDER BY numero DESC
         LIMIT 1`,
        [tenantId, `${searchPrefix}%`],
      );
      const lastNumber = String(existingRows?.[0]?.numero ?? '');
      if (lastNumber.startsWith(searchPrefix)) {
        const match = lastNumber.slice(searchPrefix.length).match(/^(\d+)/);
        const lastSequence = match ? Number(match[1]) : 0;
        if (Number.isSafeInteger(lastSequence) && sequence <= lastSequence) {
          sequence = lastSequence + 1;
        }
      }
      await manager.query(
        `UPDATE invoice_number_sequences
         SET next_value = ?
         WHERE tenant_id = ? AND scope_key = ?`,
        [sequence + 1, tenantId, scopeKey],
      );
      return sequence;
    });

    const buildNumero = (seq: number) =>
      template
        .replace('{PREFIX}', prefix)
        .replace('{YYYY}',   YYYY)
        .replace('{MM}',     MM)
        .replace('{NNNN}',   seq.toString().padStart(padding, '0'));

    return buildNumero(nextSeq);
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

  private async transitionInvoice(
    id: string,
    expectedStatus: StatutFacture,
    targetStatus: StatutFacture,
    eventType: 'invoice.issued' | 'invoice.validated',
    actor: InvoiceActor,
  ): Promise<Facture> {
    return this.dataSource.transaction(async (manager) => {
      const facture = await this.lockInvoice(manager, id);
      if (facture.status !== expectedStatus) {
        throw new BadRequestException(
          `Transition refusée : statut attendu ${expectedStatus}, statut actuel ${facture.status}`,
        );
      }
      this.assertInvoiceIntegrity(facture);
      facture.status = targetStatus;
      const saved = await manager.getRepository(Facture).save(facture);
      const audit = await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action: eventType,
        resourceType: 'invoice',
        resourceId: saved.id,
        dossierId: saved.dossier_id,
        beforeState: { status: expectedStatus },
        afterState: { status: targetStatus },
      });
      await this.outboxService.enqueue(manager, {
        eventType,
        aggregateType: 'invoice',
        aggregateId: saved.id,
        idempotencyKey: `${eventType}:${audit.id}`,
        payload: this.invoiceEventPayload(saved),
      });
      return saved;
    });
  }

  private async validateCreditNote(
    id: string,
    actor: InvoiceActor,
  ): Promise<Facture> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const credit = await this.lockInvoice(manager, id);
      if (
        credit.nature !== InvoiceNature.CREDIT_NOTE ||
        !credit.originalInvoiceId
      ) {
        throw new BadRequestException("La facture n'est pas un avoir rattaché");
      }
      if (credit.status !== StatutFacture.ENVOYEE) {
        throw new BadRequestException(
          'Un avoir doit être émis avant sa validation',
        );
      }
      this.assertInvoiceIntegrity(credit);
      const original = await this.lockInvoice(
        manager,
        credit.originalInvoiceId,
      );
      if (original.status === StatutFacture.ANNULEE) {
        throw new BadRequestException(
          'La facture d’origine est déjà clôturée',
        );
      }
      const existingCreditMinor = await this.validatedCreditsMinor(
        manager,
        original.id,
        credit.id,
      );
      const creditMinor = this.toMinorUnits(credit.montantTTC, false);
      const originalMinor = this.toMinorUnits(original.montantTTC, false);
      const paidMinor = await this.validatedPaymentsMinor(
        manager,
        original.id,
      );
      const netAfterCredit =
        originalMinor - existingCreditMinor - creditMinor;
      if (netAfterCredit < 0) {
        throw new BadRequestException(
          'Le cumul des avoirs dépasserait la facture d’origine',
        );
      }
      if (paidMinor > netAfterCredit) {
        throw new BadRequestException(
          'La validation créerait un trop-perçu non remboursé',
        );
      }

      credit.status = StatutFacture.VALIDEE;
      const savedCredit = await manager.getRepository(Facture).save(credit);
      const previousOriginalStatus = original.status;
      if (paidMinor === netAfterCredit) {
        if (paidMinor === 0) {
          original.status = StatutFacture.ANNULEE;
          original.settlementDisposition =
            InvoiceSettlementDisposition.CREDITED;
          original.dispositionReason = `Soldée par l’avoir ${credit.numero}`;
          original.dispositionAt = new Date();
          original.dispositionBy =
            actor.userId == null && actor.id == null
              ? null
              : String(actor.userId ?? actor.id);
        } else {
          original.status = StatutFacture.PAYEE;
        }
      } else {
        original.status =
          paidMinor > 0
            ? StatutFacture.PARTIELLEMENT_PAYEE
            : StatutFacture.VALIDEE;
      }
      await manager.getRepository(Facture).save(original);
      const audit = await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action: 'invoice.credit_note.validated',
        resourceType: 'invoice',
        resourceId: savedCredit.id,
        dossierId: savedCredit.dossier_id,
        beforeState: { status: StatutFacture.ENVOYEE },
        afterState: {
          status: savedCredit.status,
          originalInvoiceId: original.id,
          originalInvoiceStatus: original.status,
          netReceivableMinor: netAfterCredit,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'invoice.credit_note.validated',
        aggregateType: 'invoice',
        aggregateId: savedCredit.id,
        idempotencyKey: `invoice-credit-note-validated:${savedCredit.id}`,
        payload: this.invoiceEventPayload(savedCredit, {
          auditId: audit.id,
          originalInvoiceId: original.id,
          originalInvoiceNumber: original.numero,
          previousOriginalStatus,
          originalInvoiceStatus: original.status,
        }),
      });
      return savedCredit;
    });
  }

  private async applyDisposition(
    id: string,
    disposition:
      | InvoiceSettlementDisposition.WAIVED
      | InvoiceSettlementDisposition.BAD_DEBT,
    rawReason: string,
    actor: InvoiceActor,
  ): Promise<Facture> {
    const reason = rawReason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Un motif explicite d’au moins 10 caractères est obligatoire',
      );
    }
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const invoice = await this.lockInvoice(manager, id);
      if (invoice.nature === InvoiceNature.CREDIT_NOTE) {
        throw new BadRequestException(
          'Une disposition de créance ne s’applique pas à un avoir',
        );
      }
      if (
        ![
          StatutFacture.VALIDEE,
          StatutFacture.PARTIELLEMENT_PAYEE,
        ].includes(invoice.status)
      ) {
        throw new BadRequestException(
          'Seule une créance validée et non soldée peut être abandonnée ou déclarée irrécouvrable',
        );
      }
      const invoiceMinor = this.toMinorUnits(invoice.montantTTC, false);
      const paidMinor = await this.validatedPaymentsMinor(manager, invoice.id);
      const creditedMinor = await this.validatedCreditsMinor(
        manager,
        invoice.id,
      );
      const remainingMinor = invoiceMinor - paidMinor - creditedMinor;
      if (remainingMinor <= 0) {
        throw new BadRequestException('La facture ne porte plus de créance');
      }
      const previousStatus = invoice.status;
      invoice.status = StatutFacture.ANNULEE;
      invoice.settlementDisposition = disposition;
      invoice.dispositionReason = reason;
      invoice.dispositionAt = new Date();
      invoice.dispositionBy =
        actor.userId == null && actor.id == null
          ? null
          : String(actor.userId ?? actor.id);
      const saved = await manager.getRepository(Facture).save(invoice);
      const action =
        disposition === InvoiceSettlementDisposition.WAIVED
          ? 'invoice.waived'
          : 'invoice.bad_debt';
      const audit = await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id ?? null,
        action,
        resourceType: 'invoice',
        resourceId: saved.id,
        dossierId: saved.dossier_id,
        beforeState: {
          status: previousStatus,
          settlementDisposition: InvoiceSettlementDisposition.NONE,
        },
        afterState: {
          status: saved.status,
          settlementDisposition: saved.settlementDisposition,
          remainingMinor,
        },
        justification: reason,
      });
      await this.outboxService.enqueue(manager, {
        eventType: action,
        aggregateType: 'invoice',
        aggregateId: saved.id,
        idempotencyKey: `${action}:${saved.id}`,
        payload: this.invoiceEventPayload(saved, {
          auditId: audit.id,
          previousStatus,
          reason,
          remainingAmount: this.fromMinorUnits(remainingMinor),
        }),
      });
      return saved;
    });
  }

  private async validatedPaymentsMinor(
    manager: EntityManager,
    invoiceId: string,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT COALESCE(SUM(montant), 0) AS total
       FROM paiements
       WHERE tenant_id = ?
         AND facture_id = ?
         AND status = ?
         AND deleted_at IS NULL`,
      [getCurrentTenantId(), invoiceId, StatutPaiement.VALIDE],
    );
    const amount = Number(rows?.[0]?.total ?? 0);
    return amount > 0 ? this.toMinorUnits(amount, false) : 0;
  }

  private async validatedCreditsMinor(
    manager: EntityManager,
    invoiceId: string,
    excludedCreditId?: string,
  ): Promise<number> {
    const parameters: any[] = [
      getCurrentTenantId(),
      invoiceId,
      InvoiceNature.CREDIT_NOTE,
      StatutFacture.VALIDEE,
    ];
    const exclusion = excludedCreditId
      ? 'AND id <> ?'
      : '';
    if (excludedCreditId) parameters.push(excludedCreditId);
    const rows = await manager.query(
      `SELECT COALESCE(SUM(montant_ttc), 0) AS total
       FROM factures
       WHERE tenant_id = ?
         AND original_invoice_id = ?
         AND nature = ?
         AND status = ?
         AND deleted_at IS NULL
         ${exclusion}`,
      parameters,
    );
    const amount = Number(rows?.[0]?.total ?? 0);
    return amount > 0 ? this.toMinorUnits(amount, false) : 0;
  }

  private async lockInvoice(
    manager: EntityManager,
    id: string,
  ): Promise<Facture> {
    const facture = await manager
      .getRepository(Facture)
      .createQueryBuilder('invoice')
      .setLock('pessimistic_write')
      .where('invoice.id = :id', { id })
      .andWhere('invoice.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .getOne();
    if (!facture) throw new NotFoundException('Facture introuvable');
    return facture;
  }

  private assertInvoiceIntegrity(facture: Facture): void {
    if (
      !facture.dossier_id ||
      !facture.client_id ||
      !facture.numero?.trim() ||
      !facture.dateFacture ||
      !facture.dateEcheance
    ) {
      throw new BadRequestException(
        'La facture ne contient pas toutes les informations obligatoires',
      );
    }
    const ht = this.toMinorUnits(facture.montantHT, false);
    const tva = this.toMinorUnits(facture.montantTVA, true);
    const ttc = this.toMinorUnits(facture.montantTTC, false);
    if (ht + tva !== ttc) {
      throw new BadRequestException(
        'Les montants HT, TVA et TTC de la facture sont incohérents',
      );
    }
    if (
      new Date(facture.dateEcheance).getTime() <
      new Date(facture.dateFacture).getTime()
    ) {
      throw new BadRequestException(
        'La date d’échéance ne peut pas précéder la date de facture',
      );
    }
  }

  private toMinorUnits(
    value: number | string,
    allowZero: boolean,
  ): number {
    const numeric = Number(value);
    if (
      !Number.isFinite(numeric) ||
      (allowZero ? numeric < 0 : numeric <= 0)
    ) {
      throw new BadRequestException('Montant de facture invalide');
    }
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Les montants doivent utiliser au plus deux décimales',
      );
    }
    return rounded;
  }

  private fromMinorUnits(value: number): number {
    return value / 100;
  }

  private invoiceEventPayload(
    facture: Facture,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      invoiceId: facture.id,
      dossierId: facture.dossier_id,
      clientId: facture.client_id,
      numero: facture.numero,
      dateFacture: facture.dateFacture,
      montantHT: facture.montantHT,
      montantTVA: facture.montantTVA,
      montantTTC: facture.montantTTC,
      status: facture.status,
      nature: facture.nature,
      originalInvoiceId: facture.originalInvoiceId,
      settlementDisposition: facture.settlementDisposition,
      ...extra,
    };
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
      annulee: StatutFacture.ANNULEE,
      annulée: StatutFacture.ANNULEE,
      validee: StatutFacture.VALIDEE,
      validée: StatutFacture.VALIDEE,
    };

    return labels[String(value).toLowerCase()] ?? (value as unknown as StatutFacture);
  }

  private isBillableStatus(status: StatutFacture): boolean {
    return [
      StatutFacture.VALIDEE,
      StatutFacture.PARTIELLEMENT_PAYEE,
      StatutFacture.PAYEE,
    ].includes(status);
  }

}
