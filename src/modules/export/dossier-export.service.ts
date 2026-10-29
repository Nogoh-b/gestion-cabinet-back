import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { Response } from 'express';
import { Archiver, ZipArchive } from 'archiver';
import { existsSync, readFileSync, statSync } from 'fs';
import { randomBytes } from 'crypto';
import { basename, extname, isAbsolute, join } from 'path';

import {
  UPLOAD_DOCS_PATH,
  UPLOAD_PATH,
} from 'src/core/common/constants/constants';
import { Dossier } from '../dossiers/entities/dossier.entity';
import {
  type DossierScopeUser,
  dossierRoleScope,
} from '../dossiers/dossier-role-scope';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import {
  ModePaiement,
  StatutPaiement,
} from '../paiement/dto/create-paiement.dto';
import {
  invoiceStatusLabel,
  summarizeInvoices,
} from '../facture/invoice-totals';
import {
  Audience,
  AudienceStatus,
  AudienceType1,
} from '../audiences/entities/audience.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { Step, StepStatus, StepType } from '../dossiers/entities/step.entity';
import {
  type HiddenFields,
  type RestrictedFieldsUser,
  hiddenResponseFields,
  redactRestrictedFields,
  seesAllRestrictedFields,
} from 'src/core/security/restricted-fields';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { TypeFacture } from '../facture/dto/create-facture.dto';
import {
  BillableItem,
  DossierBillingProfile,
  DossierBillingRule,
  InvoiceLine,
} from '../case-workflow/entities/billing.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../case-workflow/entities/dossier-action.entity';
import {
  ActionBillingDecision,
  ActionPriority,
  BillableCategory,
  DossierActionStatus,
} from '../case-workflow/case-workflow.enums';
import { User } from '../iam/user/entities/user.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { DossierExportStore } from './dossier-export.store';
import { DossierSqlExporter } from './dossier-sql.exporter';
import { renderInvoicePdf } from './invoice-pdf.renderer';
import {
  EXPORT_FORMAT_VERSION,
  type ExportAccess,
  type ExportCabinet,
  type ExportDossier,
  type ExportManifest,
  type ExportManifestEntry,
  exportScript,
} from './export-format';

// Gabarit de la visionneuse hors-ligne, copié à la racine de chaque ZIP
// (livré dans dist par nest-cli.json > assets).
const VIEWER_PATH = join(__dirname, 'viewer');
const VIEWER_FILES = ['index.html', 'app.js', 'style.css'];

function sanitize(s: any): string {
  return (
    String(s ?? '')
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'sans-nom'
  );
}

/** Sérialise des lignes en CSV (UTF-8 BOM, séparateur ';'). */
function toCsv(rows: any[]): string {
  if (!rows.length) return '﻿(aucune donnée)';
  const cols = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.entries(r).forEach(([k, v]) => {
        if (v === null || v === undefined || typeof v !== 'object') set.add(k);
      });
      return set;
    }, new Set<string>()),
  );
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = cols.map(esc).join(';');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(';')).join('\n');
  return '﻿' + head + '\n' + body;
}

function fmtDate(d: any): string {
  if (!d) return '—';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function fmtMoney(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const AUDIENCE_TYPE_LABELS: Record<number, string> = {
  [AudienceType1.HEARING]: 'Plaidoirie',
  [AudienceType1.DELIBERATION]: 'Délibération',
  [AudienceType1.JUDGMENT]: 'Jugement',
  [AudienceType1.CONCILIATION]: 'Conciliation',
};

const STEP_STATUS_LABELS: Record<number, string> = {
  [StepStatus.PENDING]: 'En attente',
  [StepStatus.IN_PROGRESS]: 'En cours',
  [StepStatus.COMPLETED]: 'Terminé',
  [StepStatus.CANCELLED]: 'Annulé',
};

const STEP_TYPE_LABELS: Record<string, string> = {
  [StepType.OPENING]: 'Ouverture',
  [StepType.AMIABLE]: 'Amiable',
  [StepType.CONTENTIOUS]: 'Contentieux',
  [StepType.DECISION]: 'Décision',
  [StepType.APPEAL]: 'Appel',
  [StepType.CLOSURE]: 'Clôture',
};

const PAYMENT_MODE_LABELS: Record<number, string> = {
  [ModePaiement.VIREMENT]: 'Virement',
  [ModePaiement.CHEQUE]: 'Chèque',
  [ModePaiement.ESPECES]: 'Espèces',
  [ModePaiement.CARTE]: 'Carte',
  [ModePaiement.PRELEVEMENT]: 'Prélèvement',
  [ModePaiement.Mobile]: 'Mobile money',
  [ModePaiement.AUTRE]: 'Autre',
};

const PAYMENT_STATUS_LABELS: Record<number, string> = {
  [StatutPaiement.EN_ATTENTE]: 'En attente',
  [StatutPaiement.VALIDE]: 'Validé',
  [StatutPaiement.REJETE]: 'Rejeté',
  [StatutPaiement.ANNULE]: 'Annulé',
};

const AUDIENCE_STATUS_LABELS: Record<number, string> = {
  [AudienceStatus.SCHEDULED]: 'Programmée',
  [AudienceStatus.HELD]: 'Tenue',
  [AudienceStatus.POSTPONED]: 'Reportée',
  [AudienceStatus.CANCELLED]: 'Annulée',
};

const ACTION_STATUS_LABELS: Record<string, string> = {
  [DossierActionStatus.TODO]: 'À faire',
  [DossierActionStatus.IN_PROGRESS]: 'En cours',
  [DossierActionStatus.ON_HOLD]: 'En attente',
  [DossierActionStatus.COMPLETED]: 'Terminée',
  [DossierActionStatus.CANCELLED]: 'Annulée',
};

const ACTION_PRIORITY_LABELS: Record<string, string> = {
  [ActionPriority.LOW]: 'Basse',
  [ActionPriority.NORMAL]: 'Normale',
  [ActionPriority.HIGH]: 'Haute',
  [ActionPriority.CRITICAL]: 'Critique',
};

const BILLING_DECISION_LABELS: Record<string, string> = {
  [ActionBillingDecision.NOT_DECIDED]: 'Non décidé',
  [ActionBillingDecision.BILLABLE]: 'Facturable',
  [ActionBillingDecision.INCLUDED_IN_PACKAGE]: 'Inclus au forfait',
  [ActionBillingDecision.HOURLY]: 'Au temps passé',
  [ActionBillingDecision.VACATION]: 'Vacation',
  [ActionBillingDecision.NON_BILLABLE]: 'Non facturable',
  [ActionBillingDecision.NEEDS_REVIEW]: 'À revoir',
};

const BILLABLE_CATEGORY_LABELS: Record<string, string> = {
  [BillableCategory.OPENING_FEE]: "Frais d'ouverture",
  [BillableCategory.HONORARIUM]: 'Honoraires',
  [BillableCategory.VACATION]: 'Vacation',
  [BillableCategory.EXPENSE]: 'Frais',
  [BillableCategory.DISBURSEMENT]: 'Débours',
  [BillableCategory.RESULT_FEE]: 'Honoraire de résultat',
  [BillableCategory.ADJUSTMENT]: 'Ajustement',
};

const INVOICE_TYPE_LABELS: Record<number, string> = {
  [TypeFacture.HONORAIRES]: 'Honoraires',
  [TypeFacture.FRAIS_PROCEDURE]: 'Frais de procédure',
  [TypeFacture.DILIGENCES]: 'Diligences',
  [TypeFacture.AUTRES]: 'Autres',
  [TypeFacture.AVOIR]: 'Avoir',
};

/** Jamais dans un fichier de l'export, même pour un administrateur. */
const SECRET_FIELDS = new Set([
  'password',
  'refreshToken',
  'fcmToken',
  'private_key',
  'public_key',
]);

/** Appelant de l'export, tel que le porte le JWT. */
export type ExportUser = RestrictedFieldsUser &
  DossierScopeUser & { permissions?: readonly string[] | null };

/** Ce que l'appelant peut voir — mêmes règles que les écrans et l'API. */
export interface ExportRights extends ExportAccess {
  hidden: HiddenFields;
}

export function exportRights(user?: ExportUser | null): ExportRights {
  const hidden = hiddenResponseFields(user);
  const can = (code: string) =>
    !user ||
    seesAllRestrictedFields(user) ||
    (user.permissions ?? []).includes(code);
  return {
    hidden,
    // Sans droit factures : ni factures, ni lignes, ni paiements, ni totaux.
    invoices: !hidden.everywhere.has('factures'),
    // Mêmes droits que GET /dossiers/:id/billing-* et /actions.
    billing: can('view_billable_items'),
    actions: can('view_dossier_actions'),
  };
}

/** État partagé par les dossiers d'un même ZIP. */
interface ExportContext {
  generatedAt: Date;
  /** undefined : pas encore chargé ; null : introuvable. */
  cabinet?: (ExportCabinet & { logo: Buffer | null }) | null;
  entries: ExportManifestEntry[];
}

const newContext = (): ExportContext => ({
  generatedAt: new Date(),
  entries: [],
});

function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return String(value);
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const str = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const person = (p: any) =>
  p?.id ? { id: Number(p.id), full_name: p.full_name || null } : null;

const ref = (r: any) =>
  r?.id ? { id: Number(r.id), name: r.name ?? null } : null;

@Injectable()
export class DossierExportService {
  private readonly logger = new Logger(DossierExportService.name);

  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(DocumentCustomer)
    private readonly docRepo: Repository<DocumentCustomer>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(Audience)
    private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Diligence)
    private readonly diligenceRepo: Repository<Diligence>,
    @InjectRepository(Step) private readonly stepRepo: Repository<Step>,
    // Actions, facturation, comptes : `getRepository` passe aussi par le
    // filtre tenant (patch de Repository.prototype).
    @InjectDataSource() private readonly db: DataSource,
    private readonly sqlExporter: DossierSqlExporter,
    private readonly store: DossierExportStore,
    private readonly quota: PlanQuotaService,
  ) {}

  /** Coordonnées du cabinet (en-tête des PDF, manifeste). */
  private async loadCabinet(
    tenantId: number,
  ): Promise<(ExportCabinet & { logo: Buffer | null }) | null> {
    try {
      const [row] = await this.db.query(
        'SELECT id, code, name, address, contact_email, contact_phone, website, logo FROM cabinets WHERE id = ? LIMIT 1',
        [tenantId],
      );
      if (!row) return null;
      return {
        id: Number(row.id),
        code: row.code ?? null,
        name: row.name ?? null,
        address: row.address ?? null,
        email: row.contact_email ?? null,
        phone: row.contact_phone ?? null,
        website: row.website ?? null,
        logo: Buffer.isBuffer(row.logo) ? row.logo : null,
      };
    } catch (e) {
      this.logger.warn(`[Export] Cabinet ${tenantId} illisible : ${(e as Error).message}`);
      return null;
    }
  }

  /** Résout le chemin physique d'un document à partir de file_path. */
  private resolvePath(filePath?: string | null): string | null {
    if (!filePath) return null;
    const candidates = [
      isAbsolute(filePath) ? filePath : null,
      join(UPLOAD_DOCS_PATH, filePath),
      join(UPLOAD_PATH, filePath),
      filePath,
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      try {
        if (existsSync(c) && statSync(c).isFile()) return c;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /** Taille estimée du ZIP : somme des fichiers des documents des dossiers demandés. */
  private async estimateBytes(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const docs = await this.docRepo.find({
      where: { dossier_id: In(ids) } as any,
      select: { id: true, file_size: true } as any,
    });
    return docs.reduce((sum, d) => sum + (Number(d.file_size) || 0), 0);
  }

  /**
   * Produit le ZIP de un ou plusieurs dossiers dans
   * uploads/exports/<tenant>/, vérifie qu'il tient dans l'espace du cabinet,
   * l'enregistre (dossier_exports) puis l'envoie au client. Trop volumineux
   * (estimation avant, taille réelle après) : fichier supprimé, 403.
   */
  async streamZip(
    res: Response,
    ids: number[],
    user?: ExportUser,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    // Mêmes règles que les réponses JSON : sans droit sur les factures, ni
    // factures, ni paiements, ni totaux ; salaires et taux masqués partout.
    const rights = exportRights(user);
    // Même portée que la liste des dossiers : un avocat n'exporte que ses
    // dossiers ; les autres identifiants sont ignorés comme les absents.
    const scope = dossierRoleScope(user);

    // Refus rapide, avant tout calcul, si même l'estimation ne tient pas.
    await this.quota.checkStorageLimit(tenantId, await this.estimateBytes(ids));

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename =
      ids.length === 1
        ? `dossier-${ids[0]}_${timestamp}.zip`
        : `dossiers-export_${timestamp}.zip`;

    const target = this.store.open(
      tenantId,
      `${randomBytes(4).toString('hex')}_${filename}`,
    );
    const archive: Archiver = new ZipArchive({ zlib: { level: 9 } });
    const written = new Promise<void>((resolve, reject) => {
      target.stream.once('finish', () => resolve());
      target.stream.once('error', reject);
      archive.on('error', reject);
    });
    written.catch(() => undefined); // l'erreur est reprise par le `await written` ci-dessous
    archive.on('warning', (e) => this.logger.warn(`[Export] ${e.message}`));
    archive.pipe(target.stream);

    const ctx = newContext();
    let added = 0;
    let size = 0;
    try {
      for (const id of ids) {
        added += (await this.addDossier(archive, id, rights, scope, ctx)) ? 1 : 0;
      }
      if (added === 0) {
        archive.append('Aucun dossier accessible pour cet export.', {
          name: 'README.txt',
        });
      } else {
        // Manifeste de la visionneuse hors-ligne (cf. EXPORT_FORMAT.md).
        const { logo: _logo, ...cabinet } = ctx.cabinet ?? ({} as any);
        const manifest: ExportManifest = {
          format_version: EXPORT_FORMAT_VERSION,
          generated_at: ctx.generatedAt.toISOString(),
          cabinet: ctx.cabinet ? (cabinet as ExportCabinet) : null,
          dossiers: ctx.entries,
        };
        archive.append(exportScript('window.__EXPORT__.manifest = ', manifest), {
          name: 'data/index.js',
        });
        this.addViewer(archive);
      }
      await archive.finalize();
      await written;

      size = this.store.sizeOf(target.absPath);
      // Taille réelle : le ZIP n'est pas encore enregistré, il n'est donc pas
      // compté dans l'espace déjà utilisé.
      await this.quota.checkStorageLimit(tenantId, size);
      if (added > 0) {
        await this.store.record({
          userId: user?.id,
          dossierIds: ctx.entries.map((entry) => entry.id),
          fileName: filename,
          relPath: target.relPath,
          fileSize: size,
        });
      }
    } catch (e) {
      target.stream.destroy();
      this.store.discard(target.absPath);
      if (e instanceof HttpException) throw e;
      this.logger.error(`[Export] ${(e as Error).message}`);
      throw new InternalServerErrorException("L'export a échoué.");
    }

    this.logger.log(
      `[Export] ZIP sauvegardé → ${target.absPath} (${added} dossier(s), ${size} o)`,
    );
    res.download(target.absPath, filename, (err) => {
      if (err) this.logger.warn(`[Export] Envoi interrompu : ${err.message}`);
      // Rien d'exploitable à conserver : ZIP sans dossier, jamais enregistré.
      if (added === 0) this.store.discard(target.absPath);
    });
  }

  /** Pages de la visionneuse hors-ligne (index.html, app.js, style.css) à la racine. */
  private addViewer(archive: Archiver): void {
    for (const name of VIEWER_FILES) {
      try {
        archive.append(readFileSync(join(VIEWER_PATH, name)), { name });
      } catch (e) {
        this.logger.error(
          `[Export] Visionneuse incomplète, ${name} illisible : ${(e as Error).message}`,
        );
      }
    }
  }

  /**
   * Ajoute un dossier complet : métadonnées, résumé, documents, factures (PDF
   * + paiements), audiences, diligences, actions, facturation, SQL du dossier
   * et script de données de la visionneuse.
   */
  private async addDossier(
    archive: Archiver,
    id: number,
    rights: ExportRights,
    scope: FindOptionsWhere<Dossier>,
    ctx: ExportContext = newContext(),
  ): Promise<boolean> {
    const { hidden } = rights;
    const showInvoices = rights.invoices;
    const toJson = (value: unknown) =>
      JSON.stringify(
        redactRestrictedFields(value, hidden),
        (key, v) => (SECRET_FIELDS.has(key) ? undefined : v),
        2,
      );
    // La portée du rôle vient en dernier : elle ne peut pas être écrasée.
    const dossier = await this.dossierRepo.findOne({
      where: { id, ...scope },
      relations: [
        'client',
        'lawyer',
        'lawyer.user',
        'procedure_type',
        'jurisdiction',
      ],
    });
    if (!dossier) return false;

    const folder = `Dossier_${sanitize(dossier.dossier_number || id)}`;
    const tenantId = Number(dossier.tenant_id ?? getCurrentTenantId());
    if (ctx.cabinet === undefined) ctx.cabinet = await this.loadCabinet(tenantId);

    // ── Charger toutes les données liées ──
    const docs = await this.docRepo.find({ where: { dossier_id: id } as any });
    const factures = showInvoices
      ? await this.factureRepo.find({
          where: { dossier_id: id } as any,
          relations: ['client'],
          order: { dateFacture: 'ASC' } as any,
        })
      : [];
    const factureIds = factures.map((f) => f.id);
    // `factureId` n'est qu'un accesseur : la colonne passe par la relation.
    const paiements = factureIds.length
      ? await this.paiementRepo.find({
          where: { facture: { id: In(factureIds) } },
          relations: ['facture'],
          order: { datePaiement: 'ASC' },
        })
      : [];
    const byFacture = new Map<string, Paiement[]>();
    for (const p of paiements) {
      const key = p.facture?.id;
      if (key) byFacture.set(key, [...(byFacture.get(key) ?? []), p]);
    }
    const totals = summarizeInvoices(
      factures.map((f) => ({ ...f, paiements: byFacture.get(f.id) ?? [] })),
    );
    const audiences = await this.audienceRepo.find({
      where: { dossier_id: id } as any,
      relations: [
        'jurisdiction',
        'documents',
        'decision_documents',
        'report_documents',
      ],
      order: { audience_date: 'ASC' } as any,
    });
    const diligences = await this.diligenceRepo.find({
      where: { dossier_id: id } as any,
      relations: ['assigned_lawyer'],
      order: { deadline: 'ASC' } as any,
    });
    const steps = await this.stepRepo.find({
      where: { dossier_id: id } as any,
      relations: showInvoices
        ? ['documents', 'diligences', 'audiences', 'factures']
        : ['documents', 'diligences', 'audiences'],
      order: { id: 'ASC' } as any,
    });
    const invoiceLines = factureIds.length
      ? await this.db.getRepository(InvoiceLine).find({
          where: { facture_id: In(factureIds) },
          order: { display_order: 'ASC' },
        })
      : [];

    // Facturation du dossier : profil, règles, éléments facturables.
    const billing = rights.billing
      ? {
          profile: await this.db
            .getRepository(DossierBillingProfile)
            .findOne({ where: { dossier_id: id } }),
          rules: await this.db
            .getRepository(DossierBillingRule)
            .find({ where: { dossier_id: id }, order: { code: 'ASC' } }),
          items: await this.db
            .getRepository(BillableItem)
            .find({ where: { dossier_id: id }, order: { occurred_at: 'ASC' } }),
        }
      : null;

    // Actions et leurs liens (documents, audiences, actions dépendantes).
    const actions = rights.actions
      ? await this.db.getRepository(DossierAction).find({
          where: { dossier_id: id },
          order: { created_at: 'ASC' },
        })
      : [];
    const actionIds = actions.map((a) => a.id);
    const byAction = async <T extends { action_id: string }>(
      entity: new () => T,
    ): Promise<Map<string, T[]>> => {
      const map = new Map<string, T[]>();
      if (!actionIds.length) return map;
      const rows = await this.db
        .getRepository(entity)
        .find({ where: { action_id: In(actionIds) } as any });
      for (const row of rows) {
        map.set(row.action_id, [...(map.get(row.action_id) ?? []), row]);
      }
      return map;
    };
    const actionDocs = await byAction(DossierActionDocumentLink);
    const actionAudiences = await byAction(DossierActionAudienceLink);
    const actionRelations = await byAction(DossierActionRelation);
    const responsibleIds = [
      ...new Set(
        actions.map((a) => a.responsible_user_id).filter((v): v is number => !!v),
      ),
    ];
    const responsibles = new Map<number, User>(
      (responsibleIds.length
        ? await this.db.getRepository(User).find({
            where: { id: In(responsibleIds) },
            select: { id: true, full_name: true },
          })
        : []
      ).map((u) => [u.id, u] as const),
    );

    // ── 1. Métadonnées JSON ──
    const clientName = (dossier as any).client?.full_name ?? dossier.client_id;
    // `Employee.full_name` lit le compte utilisateur (relation lawyer.user).
    const lawyerName =
      (dossier as any).lawyer?.full_name || dossier.lawyer_id || null;
    const procedureName =
      (dossier as any).procedure_type?.name ?? dossier.procedure_type_id;

    const meta = {
      dossier_number: dossier.dossier_number,
      object: dossier.object,
      status: dossier.status,
      outcome: dossier.outcome,
      opening_date: dossier.opening_date,
      closing_date: dossier.closing_date,
      client: clientName,
      lawyer: lawyerName,
      procedure_type: procedureName,
      jurisdiction_id: dossier.jurisdiction_id,
      opposing_party_name: dossier.opposing_party_name,
      stats: {
        documents: docs.length,
        ...(showInvoices
          ? { factures: factures.length, paiements: paiements.length }
          : {}),
        audiences: audiences.length,
        diligences: diligences.length,
        ...(rights.actions ? { actions: actions.length } : {}),
        ...(billing ? { elements_facturables: billing.items.length } : {}),
      },
    };
    archive.append(toJson(meta), {
      name: `${folder}/dossier.json`,
    });

    // ── 2. Résumé enrichi ──
    const lines: string[] = [
      '═══════════════════════════════════════════════════════',
      `  DOSSIER ${dossier.dossier_number}`,
      '═══════════════════════════════════════════════════════',
      '',
      '── INFORMATIONS GÉNÉRALES ──',
      `  Objet          : ${dossier.object ?? '—'}`,
      `  Client         : ${clientName}`,
      `  Avocat         : ${lawyerName}`,
      `  Procédure      : ${procedureName ?? '—'}`,
      `  Partie adverse : ${dossier.opposing_party_name ?? '—'}`,
      `  Ouverture      : ${fmtDate(dossier.opening_date)}`,
      `  Clôture        : ${fmtDate(dossier.closing_date)}`,
      `  Statut         : ${dossier.status}`,
      `  Issue          : ${dossier.outcome ?? '—'}`,
      '',
      '── STATISTIQUES ──',
      `  Documents      : ${docs.length}`,
      ...(showInvoices
        ? [
            `  Factures       : ${factures.length}  (total hors annulées : ${fmtMoney(totals.total)} FCFA)`,
            ...(totals.cancelled.count
              ? [
                  `                   dont ${totals.cancelled.count} annulée(s) : ${fmtMoney(totals.cancelled.amount)} FCFA, exclue(s) des totaux`,
                ]
              : []),
            ...(totals.drafts.count
              ? [
                  `                   dont ${totals.drafts.count} brouillon(s) : ${fmtMoney(totals.drafts.amount)} FCFA`,
                ]
              : []),
            `  Paiements      : ${paiements.length}  (encaissé validé : ${fmtMoney(totals.paid)} FCFA)`,
            `  Solde restant  : ${fmtMoney(totals.remaining)} FCFA`,
          ]
        : []),
      `  Audiences      : ${audiences.length}`,
      `  Diligences     : ${diligences.length}`,
      ...(rights.actions ? [`  Actions        : ${actions.length}`] : []),
    ];

    // Détails documents
    if (docs.length) {
      lines.push('', '── DOCUMENTS ──');
      docs.forEach((d, i) => {
        const size = d.file_size
          ? `${(Number(d.file_size) / 1024).toFixed(1)} Ko`
          : '—';
        lines.push(
          `  ${i + 1}. ${d.name || '(sans nom)'}  [${size}]  ${fmtDate((d as any).created_at)}`,
        );
      });
    }

    // Détails factures
    if (factures.length) {
      lines.push('', '── FACTURES ──');
      totals.lines.forEach((f, i) => {
        const num = f.numero || `#${f.id}`;
        const suffix = f.cancelled
          ? '  (annulée, hors totaux)'
          : `  |  Payé : ${fmtMoney(f.paid)}  |  Reste : ${fmtMoney(f.remaining)}`;
        lines.push(
          `  ${i + 1}. ${num}  |  ${fmtMoney(f.ttc)} FCFA  |  Statut : ${f.statusLabel}  |  ${fmtDate(f.date)}${suffix}`,
        );
      });
    }

    // Détails paiements
    if (paiements.length) {
      lines.push('', '── PAIEMENTS ──');
      paiements.forEach((p, i) => {
        const mode = PAYMENT_MODE_LABELS[Number(p.modePaiement)] ?? '—';
        const statut = PAYMENT_STATUS_LABELS[Number(p.status)] ?? '—';
        lines.push(
          `  ${i + 1}. ${fmtMoney(p.montant)} FCFA  |  Facture : ${p.facture?.numero ?? '—'}  |  Mode : ${mode}  |  ${statut}  |  ${fmtDate(p.datePaiement)}`,
        );
      });
    }

    // Détails audiences
    if (audiences.length) {
      lines.push('', '── AUDIENCES ──');
      audiences.forEach((a: any, i) => {
        const typeLabel = AUDIENCE_TYPE_LABELS[a.type] ?? String(a.type);
        const statusLabel =
          AUDIENCE_STATUS_LABELS[a.status] ?? String(a.status);
        const juridiction = a.jurisdiction?.name ?? `#${a.jurisdiction_id}`;
        lines.push(
          `  ${i + 1}. ${fmtDate(a.audience_date)} ${a.audience_time ?? ''}  |  ${typeLabel}  |  ${statusLabel}  |  ${juridiction}${a.room ? ` (${a.room})` : ''}`,
        );
        if (a.decision)
          lines.push(`     → Décision : ${a.decision.slice(0, 200)}`);
        if (a.decision_text)
          lines.push(`     → Texte de la décision : ${a.decision_text.slice(0, 200)}`);
        if (a.report_content)
          lines.push(`     → Rapport d'audience : ${a.report_content.slice(0, 200)}`);
        if (a.notes) lines.push(`     → Notes : ${a.notes.slice(0, 200)}`);
      });
    }

    // Actions
    if (actions.length) {
      lines.push('', '── ACTIONS ──');
      actions.forEach((a, i) => {
        const who = responsibles.get(a.responsible_user_id ?? -1)?.full_name;
        lines.push(
          `  ${i + 1}. ${a.title}  |  ${ACTION_STATUS_LABELS[a.status] ?? a.status}  |  Échéance : ${fmtDate(a.due_at)}${who ? `  |  ${who}` : ''}`,
        );
        if (a.result_notes)
          lines.push(`     → Résultat : ${a.result_notes.slice(0, 200)}`);
      });
    }

    // Facturation
    if (billing) {
      lines.push('', '── FACTURATION ──');
      if (billing.profile) {
        lines.push(
          `  Mode : ${billing.profile.mode}  |  Devise : ${billing.profile.currency}  |  TVA : ${Number(billing.profile.vat_rate ?? 0)} %`,
        );
      }
      lines.push(
        `  Règles : ${billing.rules.length}  |  Éléments facturables : ${billing.items.length}`,
      );
      billing.items.forEach((item, i) =>
        lines.push(
          `  ${i + 1}. ${item.label}  |  ${fmtMoney(item.gross_amount)} ${item.currency}  |  ${item.status}  |  ${fmtDate(item.occurred_at)}`,
        ),
      );
    }

    // Détails diligences
    if (diligences.length) {
      lines.push('', '── DILIGENCES ──');
      diligences.forEach((d: any, i) => {
        const statusLabel = d.status ?? '—';
        const typeLabel = d.type ?? '—';
        const avocat =
          d.assigned_lawyer?.full_name ??
          (d.assigned_lawyer_id ? `#${d.assigned_lawyer_id}` : '—');
        lines.push(
          `  ${i + 1}. ${d.title ?? '(sans titre)'}  |  ${typeLabel}  |  ${statusLabel}  |  Avocat : ${avocat}`,
        );
        lines.push(
          `     Échéance : ${fmtDate(d.deadline)}  |  Heures : ${d.actual_hours ?? 0}/${d.budget_hours ?? '—'}`,
        );
        if (d.scope) lines.push(`     Périmètre : ${d.scope.slice(0, 200)}`);
        if (d.findings_summary)
          lines.push(`     Constats : ${d.findings_summary.slice(0, 200)}`);
      });
    }

    // Workflow / Procédure (étapes + ressources par étape)
    if (steps.length) {
      lines.push('', '── WORKFLOW / PROCÉDURE ──');
      steps.forEach((s: any, i) => {
        const typeLabel = STEP_TYPE_LABELS[s.type] ?? s.type ?? '—';
        const statusLabel = STEP_STATUS_LABELS[s.status] ?? String(s.status);
        lines.push(
          `  ┌─ Étape ${i + 1} : ${s.title ?? typeLabel}  [${statusLabel}]`,
        );
        lines.push(`  │  Type        : ${typeLabel}`);
        if (s.scheduledDate)
          lines.push(`  │  Planifiée   : ${fmtDate(s.scheduledDate)}`);
        if (s.completedDate)
          lines.push(`  │  Terminée    : ${fmtDate(s.completedDate)}`);
        if (s.description)
          lines.push(`  │  Description : ${s.description.slice(0, 200)}`);

        // Ressources rattachées à cette étape
        const stepDocs = s.documents ?? [];
        const stepAud = s.audiences ?? [];
        const stepDil = s.diligences ?? [];
        const stepFac = s.factures ?? [];

        if (stepDocs.length) {
          lines.push(`  │  📄 Documents (${stepDocs.length}) :`);
          stepDocs.forEach((d: any) =>
            lines.push(
              `  │     - ${d.name || '(sans nom)'}  [${d.status ?? ''}]`,
            ),
          );
        }
        if (stepAud.length) {
          lines.push(`  │  🏛 Audiences (${stepAud.length}) :`);
          stepAud.forEach((a: any) => {
            const at = AUDIENCE_TYPE_LABELS[a.type] ?? a.type;
            const as_ = AUDIENCE_STATUS_LABELS[a.status] ?? a.status;
            lines.push(
              `  │     - ${fmtDate(a.audience_date)} ${a.audience_time ?? ''} — ${at} [${as_}]`,
            );
          });
        }
        if (stepDil.length) {
          lines.push(`  │  📋 Diligences (${stepDil.length}) :`);
          stepDil.forEach((d: any) =>
            lines.push(
              `  │     - ${d.title ?? '(sans titre)'}  [${d.status ?? ''}]`,
            ),
          );
        }
        if (stepFac.length) {
          lines.push(`  │  💰 Factures (${stepFac.length}) :`);
          stepFac.forEach((f: any) => {
            const num = f.numero ?? `#${f.id}`;
            lines.push(
              `  │     - ${num}  ${fmtMoney(f.montantTTC)} FCFA  [${invoiceStatusLabel(f.status)}]`,
            );
          });
        }
        if (
          !stepDocs.length &&
          !stepAud.length &&
          !stepDil.length &&
          !stepFac.length
        ) {
          lines.push(`  │  (aucune ressource rattachée)`);
        }
        lines.push(`  └─────────────────────────────────`);
      });
    }

    lines.push(
      '',
      '═══════════════════════════════════════════════════════',
      `  Export généré le ${new Date().toLocaleString('fr-FR')}`,
      '═══════════════════════════════════════════════════════',
    );

    archive.append(lines.join('\n'), { name: `${folder}/resume.txt` });

    // ── 3. Documents (fichiers réels) ──
    const used = new Set<string>();
    const missing: string[] = [];
    /** Document → chemin dans le ZIP (visionneuse). */
    const docPaths = new Map<number, string>();
    for (const d of docs) {
      const abs = this.resolvePath(d.file_path);
      if (!abs) {
        missing.push(d.name || `document #${d.id}`);
        continue;
      }
      const ext = extname(abs) || extname(basename(d.file_path || '')) || '';
      let name =
        sanitize(d.name || basename(abs)) +
        (ext && !d.name?.endsWith(ext) ? ext : '');
      if (used.has(name)) name = `${d.id}_${name}`;
      used.add(name);
      docPaths.set(d.id, `${folder}/documents/${name}`);
      archive.file(abs, { name: `${folder}/documents/${name}` });
    }
    if (missing.length) {
      archive.append(missing.join('\n'), {
        name: `${folder}/documents/_fichiers_manquants.txt`,
      });
    }

    // ── 4-5. Factures et paiements (CSV + JSON) ──
    if (showInvoices) {
      archive.append(
        toCsv(
          totals.lines.map((f) => ({
            numero: f.numero,
            date: fmtDate(f.date),
            echeance: fmtDate(f.echeance),
            montant_ttc: f.ttc,
            paye: f.paid,
            reste: f.remaining,
            statut: f.statusLabel,
            annulee: f.cancelled ? 'Oui' : 'Non',
            avoir: f.credit ? 'Oui' : 'Non',
          })),
        ),
        { name: `${folder}/factures.csv` },
      );
      archive.append(toJson(factures), { name: `${folder}/factures.json` });
      const paymentRows = paiements.map((p) => ({
        facture: p.facture?.numero,
        montant: p.montant,
        date: fmtDate(p.datePaiement),
        mode: PAYMENT_MODE_LABELS[Number(p.modePaiement)] ?? p.modePaiement,
        statut: PAYMENT_STATUS_LABELS[Number(p.status)] ?? p.status,
        reference: p.reference,
      }));
      archive.append(toCsv(paymentRows), { name: `${folder}/paiements.csv` });
      archive.append(toJson(paymentRows), { name: `${folder}/paiements.json` });
    }

    // ── 6. Audiences (CSV + JSON) ──
    archive.append(
      toCsv(
        audiences.map((a: any) => ({
          id: a.id,
          date: fmtDate(a.audience_date),
          heure: a.audience_time,
          type: AUDIENCE_TYPE_LABELS[a.type] ?? a.type,
          statut: AUDIENCE_STATUS_LABELS[a.status] ?? a.status,
          juridiction: a.jurisdiction?.name ?? a.jurisdiction_id,
          salle: a.room,
          decision: a.decision,
          notes: a.notes,
        })),
      ),
      { name: `${folder}/audiences.csv` },
    );
    archive.append(toJson(audiences), {
      name: `${folder}/audiences.json`,
    });

    // ── 7. Diligences (CSV + JSON) ──
    archive.append(
      toCsv(
        diligences.map((d: any) => ({
          id: d.id,
          titre: d.title,
          type: d.type,
          statut: d.status,
          echeance: fmtDate(d.deadline),
          completion: fmtDate(d.completion_date),
          avocat: d.assigned_lawyer?.full_name ?? d.assigned_lawyer_id,
          heures_budget: d.budget_hours,
          heures_reelles: d.actual_hours,
          perimetre: d.scope,
          constats: d.findings_summary,
          recommandations: d.recommendations,
          confidentiel: d.confidential ? 'Oui' : 'Non',
        })),
      ),
      { name: `${folder}/diligences.csv` },
    );
    archive.append(toJson(diligences), {
      name: `${folder}/diligences.json`,
    });

    // ── 8. Actions (CSV + JSON) ──
    if (rights.actions) {
      const actionRows = actions.map((a) => ({
        titre: a.title,
        action: a.definition_label,
        statut: ACTION_STATUS_LABELS[a.status] ?? a.status,
        priorite: ACTION_PRIORITY_LABELS[a.priority] ?? a.priority,
        obligatoire: a.is_required ? 'Oui' : 'Non',
        responsable: responsibles.get(a.responsible_user_id ?? -1)?.full_name,
        planifiee: fmtDate(a.planned_at),
        echeance: fmtDate(a.due_at),
        terminee: fmtDate(a.completed_at),
        resultat: a.result_notes,
        facturation:
          BILLING_DECISION_LABELS[a.billing_decision] ?? a.billing_decision,
      }));
      archive.append(toCsv(actionRows), { name: `${folder}/actions.csv` });
      archive.append(
        toJson(
          actions.map((a) => ({
            ...a,
            documents: actionDocs.get(a.id) ?? [],
            audiences: actionAudiences.get(a.id) ?? [],
            relations: actionRelations.get(a.id) ?? [],
          })),
        ),
        { name: `${folder}/actions.json` },
      );
    }

    // ── 9. Facturation (profil, règles, éléments facturables) ──
    if (billing) {
      archive.append(toJson(billing), { name: `${folder}/facturation.json` });
      archive.append(
        toCsv(
          billing.items.map((item) => ({
            date: fmtDate(item.occurred_at),
            libelle: item.label,
            categorie: BILLABLE_CATEGORY_LABELS[item.category] ?? item.category,
            quantite: item.quantity,
            prix_unitaire: item.unit_price,
            montant_ht: item.net_amount,
            tva: item.tax_amount,
            montant_ttc: item.gross_amount,
            devise: item.currency,
            statut: item.status,
          })),
        ),
        { name: `${folder}/elements_facturables.csv` },
      );
    }
    if (showInvoices && invoiceLines.length) {
      const numeroById = new Map(factures.map((f) => [f.id, f.numero] as const));
      archive.append(
        toCsv(
          invoiceLines.map((l) => ({
            facture: numeroById.get(l.facture_id),
            libelle: l.label,
            categorie: BILLABLE_CATEGORY_LABELS[l.category] ?? l.category,
            quantite: l.quantity,
            prix_unitaire: l.unit_price,
            montant_ht: l.net_amount,
            tva: l.tax_amount,
            montant_ttc: l.gross_amount,
          })),
        ),
        { name: `${folder}/lignes_factures.csv` },
      );
    }

    // ── 10. Factures en PDF (avec paiements et reste à payer) ──
    const pdfPaths = new Map<string, string>();
    if (showInvoices && factures.length) {
      const linesByFacture = new Map<string, InvoiceLine[]>();
      for (const l of invoiceLines) {
        linesByFacture.set(l.facture_id, [...(linesByFacture.get(l.facture_id) ?? []), l]);
      }
      const totalsById = new Map(totals.lines.map((t) => [t.id, t] as const));
      const numeroById = new Map(factures.map((f) => [f.id, f.numero] as const));
      const usedPdf = new Set<string>();
      const cabinet = ctx.cabinet;
      for (const f of factures) {
        let name = `${sanitize(f.numero || f.id)}.pdf`;
        if (usedPdf.has(name)) name = `${sanitize(f.id)}_${name}`;
        usedPdf.add(name);
        const line = totalsById.get(f.id);
        const client: any = (f as any).client ?? (dossier as any).client;
        try {
          const pdf = await renderInvoicePdf({
            cabinet: {
              name: cabinet?.name,
              address: cabinet?.address,
              email: cabinet?.email,
              phone: cabinet?.phone,
              website: cabinet?.website,
              logo: cabinet?.logo,
            },
            invoice: {
              ...f,
              originalNumero: f.original_facture_id
                ? numeroById.get(f.original_facture_id) ?? null
                : null,
            },
            client: client
              ? {
                  full_name: client.full_name,
                  company_name: client.company_name,
                  address: client.address,
                  country: client.country,
                  phone: client.number_phone_1,
                  email: client.email,
                  customer_code: client.customer_code,
                }
              : null,
            dossier: {
              dossier_number: dossier.dossier_number,
              object: dossier.object,
              opening_date: dossier.opening_date,
              lawyer: lawyerName ? String(lawyerName) : null,
            },
            lines: (linesByFacture.get(f.id) ?? []).map((l) => ({
              ...l,
              category: BILLABLE_CATEGORY_LABELS[l.category] ?? null,
            })),
            payments: (byFacture.get(f.id) ?? []).map((p) => ({
              date: p.datePaiement,
              mode: PAYMENT_MODE_LABELS[Number(p.modePaiement)] ?? null,
              reference: p.reference,
              status: PAYMENT_STATUS_LABELS[Number(p.status)] ?? null,
              amount: p.montant,
              validated:
                !p.deleted_at && Number(p.status) === StatutPaiement.VALIDE,
            })),
            paid: line?.paid ?? 0,
            remaining: line?.remaining ?? 0,
            cancelled: line?.cancelled,
            generatedAt: ctx.generatedAt,
          });
          const path = `${folder}/factures/${name}`;
          archive.append(pdf, { name: path });
          pdfPaths.set(f.id, path);
        } catch (e) {
          this.logger.error(
            `[Export] PDF de la facture ${f.numero ?? f.id} : ${(e as Error).message}`,
          );
        }
      }
    }

    // ── 11. SQL du dossier ──
    const sqlPath = `database/dossier-${sanitize(dossier.dossier_number || id)}.sql`;
    try {
      const sql = await this.sqlExporter.export({
        tenantId,
        dossierIds: [id],
        include: {
          invoices: showInvoices,
          billing: rights.billing,
          actions: rights.actions,
        },
        hidden,
        label: dossier.dossier_number,
      });
      archive.append(sql, { name: sqlPath });
    } catch (e) {
      this.logger.error(`[Export] SQL du dossier ${id} : ${(e as Error).message}`);
      archive.append(
        `L'export SQL de ce dossier a échoué : ${(e as Error).message}`,
        { name: `${sqlPath}.erreur.txt` },
      );
    }

    // ── 12. Données de la visionneuse hors-ligne (cf. EXPORT_FORMAT.md) ──
    const data = this.viewerData({
      dossier,
      folder,
      sqlPath,
      rights,
      lawyerName,
      docs,
      docPaths,
      audiences,
      diligences,
      steps,
      actions,
      actionDocs,
      actionAudiences,
      actionRelations,
      responsibles,
      billing,
      factures,
      invoiceLines,
      byFacture,
      totals,
      pdfPaths,
    });
    const dataPath = `data/dossier-${id}.js`;
    archive.append(
      exportScript(
        'window.__EXPORT__.dossiers.push',
        redactRestrictedFields(data, hidden),
      ),
      { name: dataPath },
    );
    const client: any = (dossier as any).client;
    ctx.entries.push({
      id,
      dossier_number: dossier.dossier_number,
      object: dossier.object ?? null,
      client: client?.full_name ?? client?.company_name ?? null,
      status: str(dossier.status),
      opening_date: iso(dossier.opening_date),
      folder,
      data: dataPath,
      sql: sqlPath,
    });

    return true;
  }

  /** Objet `ExportDossier` du script `data/dossier-<id>.js`. */
  private viewerData(src: {
    dossier: Dossier;
    folder: string;
    sqlPath: string;
    rights: ExportRights;
    lawyerName: unknown;
    docs: DocumentCustomer[];
    docPaths: Map<number, string>;
    audiences: Audience[];
    diligences: Diligence[];
    steps: Step[];
    actions: DossierAction[];
    actionDocs: Map<string, DossierActionDocumentLink[]>;
    actionAudiences: Map<string, DossierActionAudienceLink[]>;
    actionRelations: Map<string, DossierActionRelation[]>;
    responsibles: Map<number, User>;
    billing: {
      profile: DossierBillingProfile | null;
      rules: DossierBillingRule[];
      items: BillableItem[];
    } | null;
    factures: Facture[];
    invoiceLines: InvoiceLine[];
    byFacture: Map<string, Paiement[]>;
    totals: ReturnType<typeof summarizeInvoices>;
    pdfPaths: Map<string, string>;
  }): ExportDossier {
    const { dossier: d, rights, totals } = src;
    const ids = (rows: any[] | undefined) =>
      (rows ?? []).map((r) => Number(r.id)).filter(Number.isFinite);
    const client: any = (d as any).client;
    const lawyer: any = (d as any).lawyer;
    const totalsById = new Map(totals.lines.map((t) => [t.id, t] as const));

    return {
      format_version: EXPORT_FORMAT_VERSION,
      id: d.id,
      dossier_number: d.dossier_number,
      folder: src.folder,
      sql: src.sqlPath,
      access: {
        invoices: rights.invoices,
        billing: rights.billing,
        actions: rights.actions,
      },
      dossier: {
        object: d.object ?? null,
        status: str(d.status),
        outcome: str(d.outcome),
        lifecycle_phase: str(d.lifecycle_phase),
        opening_date: iso(d.opening_date),
        closing_date: iso(d.closing_date),
        priority_level: num(d.priority_level),
        case_number: d.case_number ?? null,
        court_name: d.court_name ?? null,
        opposing_party_name: d.opposing_party_name ?? null,
        opposing_party_lawyer: d.opposing_party_lawyer ?? null,
        initial_request: d.initial_request ?? null,
        final_decision: d.final_decision ?? null,
        client: client?.id
          ? {
              id: Number(client.id),
              full_name: client.full_name ?? null,
              company_name: client.company_name ?? null,
              email: client.email ?? null,
              phone: client.number_phone_1 ?? null,
              address: client.address ?? null,
              customer_code: client.customer_code ?? null,
            }
          : null,
        lawyer: lawyer?.id
          ? { id: Number(lawyer.id), full_name: str(src.lawyerName) }
          : null,
        procedure_type: ref((d as any).procedure_type),
        jurisdiction: ref((d as any).jurisdiction),
      },
      stats: {
        documents: src.docs.length,
        audiences: src.audiences.length,
        diligences: src.diligences.length,
        steps: src.steps.length,
        actions: rights.actions ? src.actions.length : null,
        invoices: rights.invoices ? src.factures.length : null,
        payments: rights.invoices
          ? [...src.byFacture.values()].reduce((n, p) => n + p.length, 0)
          : null,
      },
      documents: src.docs.map((doc) => ({
        id: doc.id,
        name: doc.name ?? null,
        status: str(doc.status),
        mimetype: doc.file_mimetype ?? null,
        size: num(doc.file_size),
        created_at: iso(doc.created_at),
        path: src.docPaths.get(doc.id) ?? null,
      })),
      audiences: src.audiences.map((a: any) => ({
        id: a.id,
        date: iso(a.audience_date),
        time: a.audience_time ?? null,
        type: num(a.type),
        type_label: AUDIENCE_TYPE_LABELS[a.type] ?? null,
        status: num(a.status),
        status_label: AUDIENCE_STATUS_LABELS[a.status] ?? null,
        jurisdiction: ref(a.jurisdiction),
        room: a.room ?? null,
        judge_name: a.judge_name ?? null,
        duration_minutes: num(a.duration_minutes),
        outcome: a.outcome ?? null,
        notes: a.notes ?? null,
        postponed_to: iso(a.postponed_to),
        parent_audience_id: num(a.parent_audience_id),
        decision: a.decision ?? null,
        decision_text: a.decision_text ?? null,
        decision_date: iso(a.decision_date),
        decision_outcome: a.decision_outcome ?? null,
        decision_notes: a.decision_notes ?? null,
        report_content: a.report_content ?? null,
        report_date: iso(a.report_date),
        document_ids: ids(a.documents),
        decision_document_ids: ids(a.decision_documents),
        report_document_ids: ids(a.report_documents),
      })),
      diligences: src.diligences.map((g: any) => ({
        id: g.id,
        title: g.title ?? null,
        type: str(g.type),
        status: str(g.status),
        deadline: iso(g.deadline),
        completion_date: iso(g.completion_date),
        assigned_lawyer: person(g.assigned_lawyer),
        budget_hours: num(g.budget_hours),
        actual_hours: num(g.actual_hours),
        scope: g.scope ?? null,
        findings_summary: g.findings_summary ?? null,
        recommendations: g.recommendations ?? null,
        confidential: !!g.confidential,
      })),
      steps: src.steps.map((s: any) => ({
        id: s.id,
        title: s.title ?? null,
        type: str(s.type),
        type_label: STEP_TYPE_LABELS[s.type] ?? null,
        status: num(s.status),
        status_label: STEP_STATUS_LABELS[s.status] ?? null,
        scheduled_date: iso(s.scheduledDate),
        completed_date: iso(s.completedDate),
        description: s.description ?? null,
        document_ids: ids(s.documents),
        audience_ids: ids(s.audiences),
        diligence_ids: ids(s.diligences),
        invoice_ids: rights.invoices
          ? (s.factures ?? []).map((f: any) => String(f.id))
          : [],
      })),
      actions: rights.actions
        ? src.actions.map((a) => ({
            id: a.id,
            title: a.title ?? null,
            definition_code: a.definition_code ?? null,
            definition_label: a.definition_label ?? null,
            status: a.status,
            status_label: ACTION_STATUS_LABELS[a.status] ?? a.status,
            priority: a.priority,
            priority_label: ACTION_PRIORITY_LABELS[a.priority] ?? a.priority,
            is_required: !!a.is_required,
            responsible: person(src.responsibles.get(a.responsible_user_id ?? -1)),
            planned_at: iso(a.planned_at),
            due_at: iso(a.due_at),
            started_at: iso(a.started_at),
            completed_at: iso(a.completed_at),
            cancelled_at: iso(a.cancelled_at),
            result_code: a.result_code ?? null,
            result_notes: a.result_notes ?? null,
            duration_minutes: num(a.duration_minutes),
            billing_decision: a.billing_decision,
            billing_decision_label:
              BILLING_DECISION_LABELS[a.billing_decision] ?? a.billing_decision,
            billing_reason: a.billing_reason ?? null,
            documents: (src.actionDocs.get(a.id) ?? []).map((l) => ({
              document_id: Number(l.document_id),
              role: l.role,
            })),
            audiences: (src.actionAudiences.get(a.id) ?? []).map((l) => ({
              audience_id: Number(l.audience_id),
              role: l.role,
            })),
            relations: (src.actionRelations.get(a.id) ?? []).map((l) => ({
              action_id: l.related_action_id,
              role: l.role,
            })),
          }))
        : null,
      billing: src.billing
        ? {
            profile: src.billing.profile
              ? {
                  currency: src.billing.profile.currency,
                  mode: src.billing.profile.mode,
                  vat_rate: num(src.billing.profile.vat_rate),
                  fixed_fee: num(src.billing.profile.fixed_fee),
                  hourly_rate: num(src.billing.profile.hourly_rate),
                  percentage_rate: num(src.billing.profile.percentage_rate),
                  percentage_base: num(src.billing.profile.percentage_base),
                  opening_fee: num(src.billing.profile.opening_fee),
                  opening_fee_enabled: !!src.billing.profile.opening_fee_enabled,
                  default_vacation_rate: num(src.billing.profile.default_vacation_rate),
                  result_fee_enabled: !!src.billing.profile.result_fee_enabled,
                  result_fee_rate: num(src.billing.profile.result_fee_rate),
                  rebill_expenses: !!src.billing.profile.rebill_expenses,
                  rebill_disbursements: !!src.billing.profile.rebill_disbursements,
                  is_confirmed: !!src.billing.profile.is_confirmed,
                }
              : null,
            rules: src.billing.rules.map((r: any) => ({
              id: r.id,
              code: r.code,
              fee_type: r.fee_type,
              trigger: r.trigger,
              category: r.category ?? null,
              calculation_mode: r.calculation_mode,
              rate: num(r.rate),
              action_definition_code: r.action_definition_code ?? null,
              is_active: !!r.is_active,
            })),
            items: src.billing.items.map((i: any) => ({
              id: i.id,
              label: i.label ?? null,
              category: i.category,
              source_type: i.source_type,
              calculation_mode: i.calculation_mode,
              status: i.status,
              occurred_at: iso(i.occurred_at),
              quantity: num(i.quantity) ?? 0,
              unit_label: i.unit_label ?? null,
              unit_price: num(i.unit_price) ?? 0,
              net_amount: num(i.net_amount) ?? 0,
              tax_rate: num(i.tax_rate) ?? 0,
              tax_amount: num(i.tax_amount) ?? 0,
              gross_amount: num(i.gross_amount) ?? 0,
              currency: i.currency,
              action_id: i.action_id ?? null,
              invoice_line_id: i.invoice_line_id ?? null,
            })),
          }
        : null,
      invoices: rights.invoices
        ? src.factures.map((f) => {
            const t = totalsById.get(f.id);
            return {
              id: f.id,
              numero: f.numero ?? null,
              type: num(f.type),
              type_label: INVOICE_TYPE_LABELS[Number(f.type)] ?? null,
              status: Number(f.status),
              status_label: invoiceStatusLabel(f.status),
              label: f.libelle ?? null,
              date: iso(f.dateFacture),
              due_date: iso(f.dateEcheance),
              currency: f.currency || 'XAF',
              amount_ht: num(f.montantHT) ?? 0,
              vat_rate: num(f.tauxTVA) ?? 0,
              vat_amount: num(f.montantTVA) ?? 0,
              amount_ttc: num(f.montantTTC) ?? 0,
              paid: t?.paid ?? 0,
              remaining: t?.remaining ?? 0,
              cancelled: !!t?.cancelled,
              draft: !!t?.draft,
              credit: !!t?.credit,
              original_invoice_id: f.original_facture_id ?? null,
              pdf: src.pdfPaths.get(f.id) ?? null,
              lines: src.invoiceLines
                .filter((l) => l.facture_id === f.id)
                .map((l: any) => ({
                  id: l.id,
                  label: l.label ?? null,
                  category: l.category ?? null,
                  quantity: num(l.quantity) ?? 0,
                  unit_label: l.unit_label ?? null,
                  unit_price: num(l.unit_price) ?? 0,
                  net_amount: num(l.net_amount) ?? 0,
                  tax_rate: num(l.tax_rate) ?? 0,
                  tax_amount: num(l.tax_amount) ?? 0,
                  gross_amount: num(l.gross_amount) ?? 0,
                })),
              payments: (src.byFacture.get(f.id) ?? []).map((p) => ({
                id: p.id,
                date: iso(p.datePaiement),
                value_date: iso(p.dateValeur),
                amount: num(p.montant) ?? 0,
                mode: num(p.modePaiement),
                mode_label: PAYMENT_MODE_LABELS[Number(p.modePaiement)] ?? null,
                status: num(p.status),
                status_label: PAYMENT_STATUS_LABELS[Number(p.status)] ?? null,
                validated:
                  !p.deleted_at && Number(p.status) === StatutPaiement.VALIDE,
                reference: p.reference ?? null,
                cheque_number: p.numeroCheque ?? null,
                bank: p.banque ?? null,
                notes: p.notes ?? null,
              })),
            };
          })
        : null,
      invoice_totals: rights.invoices
        ? {
            count: totals.count,
            total: totals.total,
            paid: totals.paid,
            remaining: totals.remaining,
            cancelled: totals.cancelled,
            drafts: totals.drafts,
            credits: totals.credits,
          }
        : null,
    };
  }
}
