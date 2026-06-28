import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Response } from 'express';
import { Archiver, ZipArchive } from 'archiver';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { basename, extname, isAbsolute, join } from 'path';

import { UPLOAD_DOCS_PATH, UPLOAD_PATH } from 'src/core/common/constants/constants';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { Audience, AudienceStatus, AudienceType1 } from '../audiences/entities/audience.entity';
import { Diligence, DiligenceStatus, DiligenceType } from '../diligence/entities/diligence.entity';
import { Step, StepStatus, StepType } from '../dossiers/entities/step.entity';

/** Dossier de stockage des exports ZIP sur le serveur. */
const EXPORT_PATH = join(UPLOAD_PATH, 'exports');

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

const AUDIENCE_STATUS_LABELS: Record<number, string> = {
  [AudienceStatus.SCHEDULED]: 'Programmée',
  [AudienceStatus.HELD]: 'Tenue',
  [AudienceStatus.POSTPONED]: 'Reportée',
  [AudienceStatus.CANCELLED]: 'Annulée',
};

@Injectable()
export class DossierExportService {
  private readonly logger = new Logger(DossierExportService.name);

  constructor(
    @InjectRepository(Dossier) private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(DocumentCustomer) private readonly docRepo: Repository<DocumentCustomer>,
    @InjectRepository(Facture) private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement) private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(Audience) private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Diligence) private readonly diligenceRepo: Repository<Diligence>,
    @InjectRepository(Step) private readonly stepRepo: Repository<Step>,
  ) {}

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
      try { if (existsSync(c) && statSync(c).isFile()) return c; } catch { /* ignore */ }
    }
    return null;
  }

  /** Garantit que le dossier d'export existe. */
  private ensureExportDir(): void {
    if (!existsSync(EXPORT_PATH)) {
      mkdirSync(EXPORT_PATH, { recursive: true });
    }
  }

  /** Stream un ZIP contenant un ou plusieurs dossiers vers la réponse HTTP
   *  ET sauvegarde une copie sur le serveur dans uploads/exports/. */
  async streamZip(res: Response, ids: number[]): Promise<void> {
    this.ensureExportDir();

    const archive: Archiver = new ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (e) => this.logger.warn(`[Export] ${e.message}`));
    archive.on('error', (e) => {
      this.logger.error(`[Export] ${e.message}`);
      if (!res.headersSent) res.status(500);
      res.destroy(e);
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = ids.length === 1
      ? `dossier-${ids[0]}_${timestamp}.zip`
      : `dossiers-export_${timestamp}.zip`;

    // Sauvegarde locale sur le serveur
    const serverPath = join(EXPORT_PATH, filename);
    const fileStream = createWriteStream(serverPath);
    archive.pipe(fileStream);

    // Stream vers le client HTTP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    archive.pipe(res);

    let added = 0;
    for (const id of ids) {
      added += (await this.addDossier(archive, id)) ? 1 : 0;
    }
    if (added === 0) {
      archive.append('Aucun dossier accessible pour cet export.', { name: 'README.txt' });
    }
    await archive.finalize();

    this.logger.log(`[Export] ZIP sauvegardé → ${serverPath} (${added} dossier(s))`);
  }

  /** Ajoute un dossier complet (métadonnées + documents + factures + paiements + audiences + diligences). */
  private async addDossier(archive: Archiver, id: number): Promise<boolean> {
    const dossier = await this.dossierRepo.findOne({
      where: { id },
      relations: ['client', 'lawyer', 'procedure_type'],
    });
    if (!dossier) return false;

    const folder = `Dossier_${sanitize(dossier.dossier_number || id)}`;

    // ── Charger toutes les données liées ──
    const docs = await this.docRepo.find({ where: { dossier_id: id } as any });
    const factures = await this.factureRepo.find({ where: { dossier_id: id } as any });
    const factureIds = factures.map((f) => f.id);
    const paiements = factureIds.length
      ? await this.paiementRepo.find({ where: { factureId: In(factureIds) } as any })
      : [];
    const audiences = await this.audienceRepo.find({
      where: { dossier_id: id } as any,
      relations: ['jurisdiction'],
      order: { audience_date: 'ASC' } as any,
    });
    const diligences = await this.diligenceRepo.find({
      where: { dossier_id: id } as any,
      relations: ['assigned_lawyer'],
      order: { deadline: 'ASC' } as any,
    });
    const steps = await this.stepRepo.find({
      where: { dossier_id: id } as any,
      relations: ['documents', 'diligences', 'audiences', 'factures'],
      order: { id: 'ASC' } as any,
    });

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
      },
    };
    archive.append(JSON.stringify(meta, null, 2), { name: `${folder}/dossier.json` });

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

    // Workflow / Procédure (étapes + ressources par étape)
    if (steps.length) {
      lines.push('', '── WORKFLOW / PROCÉDURE ──');
      steps.forEach((s: any, i) => {
        const typeLabel = STEP_TYPE_LABELS[s.type] ?? s.type ?? '—';
        const statusLabel = STEP_STATUS_LABELS[s.status] ?? String(s.status);
        lines.push(`  ┌─ Étape ${i + 1} : ${s.title ?? typeLabel}  [${statusLabel}]`);
        lines.push(`  │  Type        : ${typeLabel}`);
        if (s.scheduledDate) lines.push(`  │  Planifiée   : ${fmtDate(s.scheduledDate)}`);
        if (s.completedDate) lines.push(`  │  Terminée    : ${fmtDate(s.completedDate)}`);
        if (s.description) lines.push(`  │  Description : ${s.description.slice(0, 200)}`);

        // Ressources rattachées à cette étape
        const stepDocs = s.documents ?? [];
        const stepAud = s.audiences ?? [];
        const stepDil = s.diligences ?? [];
        const stepFac = s.factures ?? [];

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
    for (const d of docs) {
      const abs = this.resolvePath(d.file_path);
      if (!abs) { missing.push(d.name || `document #${d.id}`); continue; }
      const ext = extname(abs) || extname(basename(d.file_path || '')) || '';
      let name = sanitize(d.name || basename(abs)) + (ext && !d.name?.endsWith(ext) ? ext : '');
      if (used.has(name)) name = `${d.id}_${name}`;
      used.add(name);
      archive.file(abs, { name: `${folder}/documents/${name}` });
    }
    if (missing.length) {
      archive.append(missing.join('\n'), { name: `${folder}/documents/_fichiers_manquants.txt` });
    }

    // ── 4. Factures (CSV + JSON) ──
    archive.append(toCsv(factures), { name: `${folder}/factures.csv` });
    archive.append(JSON.stringify(factures, null, 2), { name: `${folder}/factures.json` });

    // ── 5. Paiements (CSV + JSON) ──
    archive.append(toCsv(paiements), { name: `${folder}/paiements.csv` });
    archive.append(JSON.stringify(paiements, null, 2), { name: `${folder}/paiements.json` });

    // ── 6. Audiences (CSV + JSON) ──
    archive.append(toCsv(audiences.map((a: any) => ({
      id: a.id,
      date: fmtDate(a.audience_date),
      heure: a.audience_time,
      type: AUDIENCE_TYPE_LABELS[a.type] ?? a.type,
      statut: AUDIENCE_STATUS_LABELS[a.status] ?? a.status,
      juridiction: a.jurisdiction?.name ?? a.jurisdiction_id,
      salle: a.room,
      decision: a.decision,
      notes: a.notes,
    }))), { name: `${folder}/audiences.csv` });
    archive.append(JSON.stringify(audiences, null, 2), { name: `${folder}/audiences.json` });

    // ── 7. Diligences (CSV + JSON) ──
    archive.append(toCsv(diligences.map((d: any) => ({
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
    }))), { name: `${folder}/diligences.csv` });
    archive.append(JSON.stringify(diligences, null, 2), { name: `${folder}/diligences.json` });

    return true;
  }
}
