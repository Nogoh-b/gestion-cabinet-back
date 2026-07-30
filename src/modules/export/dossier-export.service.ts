import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Response } from 'express';
import { Archiver, ZipArchive } from 'archiver';
import { createReadStream, existsSync, statSync } from 'fs';
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'path';
import { createHash, randomUUID } from 'crypto';

import { AuditService } from 'src/core/audit/audit.service';
import {
  ResourceActor,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import {
  DocumentVersion,
  DocumentVersionStatus,
} from '../documents/document-customer/entities/document-version.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { Audience, AudienceStatus, AudienceType1 } from '../audiences/entities/audience.entity';
import { Diligence, DiligenceStatus, DiligenceType } from '../diligence/entities/diligence.entity';
import { StageVisit } from '../procedure/entities/stage-visit.entity';

function sanitize(s: any): string {
  return String(s ?? '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'sans-nom';
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
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const AUDIENCE_TYPE_LABELS: Record<number, string> = {
  [AudienceType1.HEARING]: 'Plaidoirie',
  [AudienceType1.DELIBERATION]: 'Délibération',
  [AudienceType1.JUDGMENT]: 'Jugement',
  [AudienceType1.CONCILIATION]: 'Conciliation',
};

const AUDIENCE_STATUS_LABELS: Record<number, string> = {
  [AudienceStatus.SCHEDULED]: 'Programmée',
  [AudienceStatus.HELD]: 'Tenue',
  [AudienceStatus.POSTPONED]: 'Reportée',
  [AudienceStatus.CANCELLED]: 'Annulée',
};

interface ExportAuditContext {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

interface ExportManifestEntry {
  path: string;
  sha256: string;
  size: number;
  kind: 'generated' | 'document';
  resourceId?: string | number;
  versionId?: string;
}

@Injectable()
export class DossierExportService {
  private readonly logger = new Logger(DossierExportService.name);
  private readonly privateStorageRoot = resolve(
    process.env.PRIVATE_STORAGE_ROOT ??
      join(process.cwd(), 'storage', 'private'),
  );

  constructor(
    @InjectRepository(Dossier) private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(DocumentCustomer) private readonly docRepo: Repository<DocumentCustomer>,
    @InjectRepository(Facture) private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement) private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(Audience) private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Diligence) private readonly diligenceRepo: Repository<Diligence>,
    @InjectRepository(StageVisit) private readonly stageVisitRepo: Repository<StageVisit>,
    private readonly dataSource: DataSource,
    private readonly resourcePolicy: ResourcePolicyService,
    private readonly auditService: AuditService,
  ) {}

  /** Résout le chemin physique d'un document à partir de file_path. */
  private resolveVersionPath(storageKey?: string | null): string | null {
    if (
      !storageKey ||
      isAbsolute(storageKey) ||
      storageKey.includes('..')
    ) {
      return null;
    }
    const candidate = resolve(this.privateStorageRoot, storageKey);
    const child = relative(this.privateStorageRoot, candidate);
    if (
      !child ||
      child.startsWith('..') ||
      isAbsolute(child)
    ) {
      return null;
    }
    try {
      return existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : null;
    } catch {
      return null;
    }
  }

  /** Stream un ZIP sans en conserver de copie dans un répertoire public. */
  async streamZip(
    res: Response,
    ids: number[],
    actor: ResourceActor,
    auditContext: ExportAuditContext = {},
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(ids));
    if (
      uniqueIds.length === 0 ||
      uniqueIds.length > 25 ||
      uniqueIds.some(
        (id) => !Number.isInteger(id) || id <= 0,
      )
    ) {
      throw new BadRequestException(
        'La demande doit contenir entre 1 et 25 dossiers valides',
      );
    }
    await Promise.all(
      uniqueIds.map((id) =>
        this.resourcePolicy.assertDossierAccess(
          id,
          actor,
          'read',
        ),
      ),
    );
    const exportId = randomUUID();
    await this.auditExport(
      uniqueIds,
      actor,
      exportId,
      'dossier.export.requested',
      auditContext,
    );
    const archive: Archiver = new ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (e) => this.logger.warn(`[Export] ${e.message}`));
    archive.on('error', (e) => {
      this.logger.error(`[Export] ${e.message}`);
      if (!res.headersSent) res.status(500);
      res.destroy(e);
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = uniqueIds.length === 1
      ? `dossier-${uniqueIds[0]}_${timestamp}.zip`
      : `dossiers-export_${timestamp}.zip`;

    // Stream vers le client HTTP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    archive.pipe(res);

    let added = 0;
    for (const id of uniqueIds) {
      added += (await this.addDossier(
        archive,
        id,
        exportId,
        actor,
      ))
        ? 1
        : 0;
    }
    if (added === 0) {
      archive.append('Aucun dossier accessible pour cet export.', { name: 'README.txt' });
    }
    await archive.finalize();
    await this.auditExport(
      uniqueIds,
      actor,
      exportId,
      'dossier.export.completed',
      auditContext,
    );

    this.logger.log(`[Export] ZIP diffusé sans copie serveur (${added} dossier(s))`);
  }

  /** Ajoute un dossier complet (métadonnées + documents + factures + paiements + audiences + diligences). */
  private async addDossier(
    archive: Archiver,
    id: number,
    exportId: string,
    actor: ResourceActor,
  ): Promise<boolean> {
    const tenantId = getCurrentTenantId();
    const dossier = await this.dossierRepo.findOne({
      where: { id, tenant_id: tenantId },
      relations: ['client', 'lawyer', 'procedure_type'],
    });
    if (!dossier) {
      throw new NotFoundException('Dossier introuvable');
    }

    const folder = `Dossier_${sanitize(dossier.dossier_number || id)}`;
    const manifest: ExportManifestEntry[] = [];

    // ── Charger toutes les données liées ──
    const docs = await this.docRepo.find({
      where: { dossier_id: id, tenant_id: tenantId } as any,
      relations: ['currentVersion'],
    });
    const factures = await this.factureRepo.find({
      where: { dossier_id: id, tenant_id: tenantId } as any,
    });
    const factureIds = factures.map((f) => f.id);
    const paiements = factureIds.length
      ? await this.paiementRepo.find({
          where: {
            factureId: In(factureIds),
            tenant_id: tenantId,
          } as any,
        })
      : [];
    const audiences = await this.audienceRepo.find({
      where: { dossier_id: id, tenant_id: tenantId } as any,
      relations: ['jurisdiction'],
      order: { audience_date: 'ASC' } as any,
    });
    const diligences = await this.diligenceRepo.find({
      where: { dossier_id: id, tenant_id: tenantId } as any,
      relations: ['assigned_lawyer'],
      order: { deadline: 'ASC' } as any,
    });
    const stageVisits = dossier.procedureInstanceId
      ? await this.stageVisitRepo.find({
          where: {
            instanceId: dossier.procedureInstanceId,
            tenant_id: tenantId,
          },
          relations: [
            'stage',
            'subStageVisits',
            'subStageVisits.subStage',
            'documents',
            'diligences',
            'audiences',
            'factures',
          ],
          order: { enteredAt: 'ASC' },
        })
      : [];

    // ── 1. Métadonnées JSON ──
    const clientName = (dossier as any).client?.full_name ?? dossier.client_id;
    const lawyerName = (dossier as any).lawyer?.full_name ?? dossier.lawyer_id;
    const procedureName = (dossier as any).procedure_type?.name ?? dossier.procedure_type_id;

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
        factures: factures.length,
        paiements: paiements.length,
        audiences: audiences.length,
        diligences: diligences.length,
        procedure_stage_visits: stageVisits.length,
      },
      procedure_instance_id: dossier.procedureInstanceId,
    };
    this.appendText(
      archive,
      `${folder}/dossier.json`,
      JSON.stringify(meta, null, 2),
      manifest,
    );

    // ── 2. Résumé enrichi ──
    const totalFacture = factures.reduce((s, f) => s + Number((f as any).total_amount ?? (f as any).amount ?? 0), 0);
    const totalPaye = paiements.reduce((s, p) => s + Number((p as any).amount ?? 0), 0);

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
      `  Factures       : ${factures.length}  (total : ${fmtMoney(totalFacture)} FCFA)`,
      `  Paiements      : ${paiements.length}  (total : ${fmtMoney(totalPaye)} FCFA)`,
      `  Solde restant  : ${fmtMoney(totalFacture - totalPaye)} FCFA`,
      `  Audiences      : ${audiences.length}`,
      `  Diligences     : ${diligences.length}`,
    ];

    // Détails documents
    if (docs.length) {
      lines.push('', '── DOCUMENTS ──');
      docs.forEach((d, i) => {
        const size = d.file_size ? `${(Number(d.file_size) / 1024).toFixed(1)} Ko` : '—';
        lines.push(`  ${i + 1}. ${d.name || '(sans nom)'}  [${size}]  ${fmtDate((d as any).created_at)}`);
      });
    }

    // Détails factures
    if (factures.length) {
      lines.push('', '── FACTURES ──');
      factures.forEach((f: any, i) => {
        const num = f.invoice_number ?? f.numero ?? `#${f.id}`;
        const montant = fmtMoney(f.total_amount ?? f.amount ?? 0);
        const statut = f.status ?? '—';
        lines.push(`  ${i + 1}. ${num}  |  ${montant} FCFA  |  Statut : ${statut}  |  ${fmtDate(f.created_at)}`);
      });
    }

    // Détails paiements
    if (paiements.length) {
      lines.push('', '── PAIEMENTS ──');
      paiements.forEach((p: any, i) => {
        const montant = fmtMoney(p.amount ?? 0);
        const mode = p.payment_method ?? p.modePaiement ?? '—';
        lines.push(`  ${i + 1}. ${montant} FCFA  |  Mode : ${mode}  |  ${fmtDate(p.payment_date ?? p.created_at)}`);
      });
    }

    // Détails audiences
    if (audiences.length) {
      lines.push('', '── AUDIENCES ──');
      audiences.forEach((a: any, i) => {
        const typeLabel = AUDIENCE_TYPE_LABELS[a.type] ?? String(a.type);
        const statusLabel = AUDIENCE_STATUS_LABELS[a.status] ?? String(a.status);
        const juridiction = a.jurisdiction?.name ?? `#${a.jurisdiction_id}`;
        lines.push(`  ${i + 1}. ${fmtDate(a.audience_date)} ${a.audience_time ?? ''}  |  ${typeLabel}  |  ${statusLabel}  |  ${juridiction}${a.room ? ` (${a.room})` : ''}`);
        if (a.decision) lines.push(`     → Décision : ${a.decision.slice(0, 200)}`);
        if (a.notes) lines.push(`     → Notes : ${a.notes.slice(0, 200)}`);
      });
    }

    // Détails diligences
    if (diligences.length) {
      lines.push('', '── DILIGENCES ──');
      diligences.forEach((d: any, i) => {
        const statusLabel = d.status ?? '—';
        const typeLabel = d.type ?? '—';
        const avocat = d.assigned_lawyer?.full_name ?? (d.assigned_lawyer_id ? `#${d.assigned_lawyer_id}` : '—');
        lines.push(`  ${i + 1}. ${d.title ?? '(sans titre)'}  |  ${typeLabel}  |  ${statusLabel}  |  Avocat : ${avocat}`);
        lines.push(`     Échéance : ${fmtDate(d.deadline)}  |  Heures : ${d.actual_hours ?? 0}/${d.budget_hours ?? '—'}`);
        if (d.scope) lines.push(`     Périmètre : ${d.scope.slice(0, 200)}`);
        if (d.findings_summary) lines.push(`     Constats : ${d.findings_summary.slice(0, 200)}`);
      });
    }

    // Procédure : historique réel de l'instance issue du template versionné.
    if (stageVisits.length) {
      lines.push('', '── WORKFLOW / PROCÉDURE ──');
      stageVisits.forEach((visit, i) => {
        const statusLabel = visit.exitedAt ? 'Terminée' : 'En cours';
        lines.push(
          `  ┌─ Visite ${i + 1} : ${visit.stage?.name ?? `Étape #${visit.stageId}`} [${statusLabel}]`,
        );
        lines.push(`  │  Numéro      : ${visit.visitNumber}`);
        lines.push(`  │  Entrée      : ${fmtDate(visit.enteredAt)}`);
        if (visit.exitedAt) lines.push(`  │  Sortie      : ${fmtDate(visit.exitedAt)}`);
        if (visit.stage?.description) {
          lines.push(`  │  Description : ${visit.stage.description.slice(0, 200)}`);
        }
        const subStages = visit.subStageVisits ?? [];
        if (subStages.length) {
          lines.push(`  │  Sous-étapes (${subStages.length}) :`);
          subStages.forEach((subVisit: any) => {
            const subStatus = subVisit.completedAt ? 'Terminée' : 'En cours';
            lines.push(`  │     - ${subVisit.subStage?.name ?? subVisit.subStageId} [${subStatus}]`);
          });
        }

        const stepDocs = visit.documents ?? [];
        const stepAud = visit.audiences ?? [];
        const stepDil = visit.diligences ?? [];
        const stepFac = visit.factures ?? [];

        if (stepDocs.length) {
          lines.push(`  │  📄 Documents (${stepDocs.length}) :`);
          stepDocs.forEach((d: any) => lines.push(`  │     - ${d.name || '(sans nom)'}  [${d.status ?? ''}]`));
        }
        if (stepAud.length) {
          lines.push(`  │  🏛 Audiences (${stepAud.length}) :`);
          stepAud.forEach((a: any) => {
            const at = AUDIENCE_TYPE_LABELS[a.type] ?? a.type;
            const as_ = AUDIENCE_STATUS_LABELS[a.status] ?? a.status;
            lines.push(`  │     - ${fmtDate(a.audience_date)} ${a.audience_time ?? ''} — ${at} [${as_}]`);
          });
        }
        if (stepDil.length) {
          lines.push(`  │  📋 Diligences (${stepDil.length}) :`);
          stepDil.forEach((d: any) => lines.push(`  │     - ${d.title ?? '(sans titre)'}  [${d.status ?? ''}]`));
        }
        if (stepFac.length) {
          lines.push(`  │  💰 Factures (${stepFac.length}) :`);
          stepFac.forEach((f: any) => {
            const num = f.invoice_number ?? `#${f.id}`;
            lines.push(`  │     - ${num}  ${fmtMoney(f.total_amount ?? f.amount ?? 0)} FCFA  [${f.status ?? ''}]`);
          });
        }
        if (!stepDocs.length && !stepAud.length && !stepDil.length && !stepFac.length) {
          lines.push(`  │  (aucune ressource rattachée)`);
        }
        lines.push(`  └─────────────────────────────────`);
      });
    }

    this.appendText(
      archive,
      `${folder}/procedure-stage-visits.json`,
      this.safeJson(stageVisits),
      manifest,
    );

    lines.push(
      '',
      '═══════════════════════════════════════════════════════',
      `  Export généré le ${new Date().toLocaleString('fr-FR')}`,
      '═══════════════════════════════════════════════════════',
    );

    this.appendText(
      archive,
      `${folder}/resume.txt`,
      lines.join('\n'),
      manifest,
    );

    // ── 3. Documents (fichiers réels) ──
    const used = new Set<string>();
    const missing: string[] = [];
    for (const d of docs) {
      const version = d.currentVersion as DocumentVersion | null;
      if (
        !version ||
        version.status !== DocumentVersionStatus.ACCEPTED
      ) {
        missing.push(
          `${d.name || `document #${d.id}`} — aucune version acceptée`,
        );
        continue;
      }
      const abs = this.resolveVersionPath(version.storageKey);
      if (!abs) {
        missing.push(
          `${d.name || `document #${d.id}`} — fichier privé introuvable`,
        );
        continue;
      }
      const actualHash = await this.hashFile(abs);
      if (actualHash !== version.sha256) {
        throw new BadRequestException(
          `Intégrité invalide pour le document ${d.id}, export interrompu`,
        );
      }
      const ext =
        extname(version.originalName) || extname(abs) || '';
      let name =
        sanitize(d.name || basename(version.originalName)) +
        (ext && !d.name?.endsWith(ext) ? ext : '');
      if (used.has(name)) name = `${d.id}_${name}`;
      used.add(name);
      const archivePath = `${folder}/documents/${name}`;
      archive.file(abs, { name: archivePath });
      manifest.push({
        path: archivePath,
        sha256: actualHash,
        size: statSync(abs).size,
        kind: 'document',
        resourceId: d.id,
        versionId: version.id,
      });
    }
    if (missing.length) {
      this.appendText(
        archive,
        `${folder}/documents/_fichiers_manquants.txt`,
        missing.join('\n'),
        manifest,
      );
    }

    // ── 4. Factures (CSV + JSON) ──
    this.appendText(
      archive,
      `${folder}/factures.csv`,
      toCsv(factures),
      manifest,
    );
    this.appendText(
      archive,
      `${folder}/factures.json`,
      this.safeJson(factures),
      manifest,
    );

    // ── 5. Paiements (CSV + JSON) ──
    this.appendText(
      archive,
      `${folder}/paiements.csv`,
      toCsv(paiements),
      manifest,
    );
    this.appendText(
      archive,
      `${folder}/paiements.json`,
      this.safeJson(paiements),
      manifest,
    );

    // ── 6. Audiences (CSV + JSON) ──
    this.appendText(
      archive,
      `${folder}/audiences.csv`,
      toCsv(
        audiences.map((a: any) => ({
          id: a.id,
          date: fmtDate(a.audience_date),
          heure: a.audience_time,
          type: AUDIENCE_TYPE_LABELS[a.type] ?? a.type,
          statut: AUDIENCE_STATUS_LABELS[a.status] ?? a.status,
          juridiction:
            a.jurisdiction?.name ?? a.jurisdiction_id,
          salle: a.room,
          decision: a.decision,
          notes: a.notes,
        })),
      ),
      manifest,
    );
    this.appendText(
      archive,
      `${folder}/audiences.json`,
      this.safeJson(audiences),
      manifest,
    );

    // ── 7. Diligences (CSV + JSON) ──
    this.appendText(
      archive,
      `${folder}/diligences.csv`,
      toCsv(
        diligences.map((d: any) => ({
          id: d.id,
          titre: d.title,
          type: d.type,
          statut: d.status,
          echeance: fmtDate(d.deadline),
          completion: fmtDate(d.completion_date),
          avocat:
            d.assigned_lawyer?.full_name ??
            d.assigned_lawyer_id,
          heures_budget: d.budget_hours,
          heures_reelles: d.actual_hours,
          perimetre: d.scope,
          constats: d.findings_summary,
          recommandations: d.recommendations,
          confidentiel: d.confidential ? 'Oui' : 'Non',
        })),
      ),
      manifest,
    );
    this.appendText(
      archive,
      `${folder}/diligences.json`,
      this.safeJson(diligences),
      manifest,
    );

    const manifestDocument = {
      schema_version: 1,
      export_id: exportId,
      tenant_id: tenantId,
      actor_id: Number(actor.userId ?? actor.id),
      dossier_id: dossier.id,
      dossier_number: dossier.dossier_number,
      generated_at: new Date().toISOString(),
      delivery: 'protected_http_stream',
      server_copy_retained: false,
      entries: manifest,
    };
    archive.append(
      Buffer.from(
        JSON.stringify(manifestDocument, null, 2),
        'utf8',
      ),
      { name: `${folder}/manifest.json` },
    );
    return true;
  }

  private appendText(
    archive: Archiver,
    path: string,
    value: string,
    manifest: ExportManifestEntry[],
  ): void {
    const content = Buffer.from(value, 'utf8');
    manifest.push({
      path,
      sha256: createHash('sha256').update(content).digest('hex'),
      size: content.length,
      kind: 'generated',
    });
    archive.append(content, { name: path });
  }

  private async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const input = createReadStream(path);
      input.on('data', (chunk) => hash.update(chunk));
      input.on('error', rejectPromise);
      input.on('end', resolvePromise);
    });
    return hash.digest('hex');
  }

  private safeJson(value: unknown): string {
    const forbidden =
      /password|secret|token|authorization|cookie|file_path|file_url|storage_key|storageKey|preuve_paiement|tenant_id|deleted_at/i;
    return JSON.stringify(
      value,
      (key, child) => (forbidden.test(key) ? undefined : child),
      2,
    );
  }

  private async auditExport(
    dossierIds: number[],
    actor: ResourceActor,
    exportId: string,
    action: string,
    context: ExportAuditContext,
  ): Promise<void> {
    const actorId = Number(actor.userId ?? actor.id);
    await this.dataSource.transaction(async (manager) => {
      for (const dossierId of dossierIds) {
        await this.auditService.append(manager, {
          actorId,
          action,
          resourceType: 'dossier_export',
          resourceId: exportId,
          dossierId,
          afterState: {
            exportId,
            dossierId,
            delivery: 'protected_http_stream',
            serverCopyRetained: false,
          },
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
          requestId: context.requestId ?? null,
        });
      }
    });
  }
}
