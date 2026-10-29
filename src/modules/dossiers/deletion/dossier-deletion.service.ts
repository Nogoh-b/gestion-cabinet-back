import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { existsSync, readdirSync, rmdirSync, unlinkSync } from 'fs';
import { dirname, isAbsolute, join, normalize } from 'path';
import { DataSource, QueryRunner } from 'typeorm';
import { UPLOAD_DOCS_PATH, UPLOAD_PATH } from 'src/core/common/constants/constants';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';

/** Éléments liés qu'on peut choisir de supprimer avec un dossier. */
export const DOSSIER_DELETION_CATEGORIES = [
  'factures',
  'audiences',
  'documents',
  'diligences',
  'actions',
  'discussions_ia',
  'chat',
  'etapes',
] as const;
export type DossierDeletionCategory = (typeof DOSSIER_DELETION_CATEGORIES)[number];

const LABELS: Record<DossierDeletionCategory, string> = {
  factures: 'Factures et paiements',
  audiences: 'Audiences',
  documents: 'Documents',
  diligences: 'Diligences',
  actions: 'Actions du dossier',
  discussions_ia: 'Discussions avec l’assistant IA',
  chat: 'Discussion d’équipe du dossier',
  etapes: 'Étapes (ancien parcours)',
};

export interface DossierDeletionPreview {
  dossier: {
    id: number;
    dossier_number: string;
    object: string | null;
    client_name: string | null;
    status: number;
    locked: boolean;
  };
  categories: Array<{
    key: DossierDeletionCategory;
    label: string;
    count: number;
    details: string | null;
    warning: string | null;
  }>;
}

export interface DossierDeletionOptions {
  include: DossierDeletionCategory[];
  /** `soft` = corbeille restaurable ; `hard` = effacement réservé aux données de test. */
  mode: 'soft' | 'hard';
  /** Libellé de l'auteur, conservé pour la restauration. */
  actor: string;
  /** Autorise un dossier clôturé ou archivé (plateforme, données de test). */
  allowLocked?: boolean;
}

type Id = number | string;

/**
 * Suppression d'un dossier avec, au choix, ses éléments liés.
 *
 * - Corbeille (`soft`) : `deleted_at` sur le dossier et les éléments cochés ;
 *   les identifiants touchés sont gardés dans `dossier_deletions` pour pouvoir
 *   tout restaurer. Les éléments non cochés restent en place.
 * - Définitif (`hard`) : tout est effacé, dans l'ordre imposé par les clés
 *   étrangères, fichiers compris. Réservé aux données de test.
 *
 * SQL explicite filtré par `tenant_id` : utilisable hors requête HTTP
 * (console plateforme) sans dépendre du contexte tenant.
 */
@Injectable()
export class DossierDeletionService {
  private readonly logger = new Logger(DossierDeletionService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Aperçu ──────────────────────────────────────────────────────────────

  async preview(tenantId: number, dossierId: number): Promise<DossierDeletionPreview> {
    const dossier = await this.findDossier(this.db, tenantId, dossierId);
    const q = (sql: string, params: any[] = []) => this.db.query(sql, params);
    const t = tenantId;

    const [factures] = await q(
      `SELECT COUNT(*) AS n,
              SUM(f.status = '3') AS paid,
              (SELECT COUNT(*) FROM paiements p JOIN factures f2 ON f2.id = p.facture_id
                WHERE f2.dossier_id = ? AND f2.tenant_id = ? AND f2.deleted_at IS NULL
                  AND p.deleted_at IS NULL) AS payments,
              (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p JOIN factures f2 ON f2.id = p.facture_id
                WHERE f2.dossier_id = ? AND f2.tenant_id = ? AND f2.deleted_at IS NULL
                  AND p.deleted_at IS NULL AND p.status = '1') AS cashed,
              MAX(f.currency) AS currency
         FROM factures f WHERE f.dossier_id = ? AND f.tenant_id = ? AND f.deleted_at IS NULL`,
      [dossierId, t, dossierId, t, dossierId, t],
    );
    const [documents] = await q(
      `SELECT COUNT(*) AS n, COALESCE(SUM(file_size), 0) AS size FROM document_customer
        WHERE dossier_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [dossierId, t],
    );
    const count = async (sql: string, params: any[]) => Number((await q(sql, params))[0]?.n ?? 0);
    const audiences = await count(
      'SELECT COUNT(*) AS n FROM audiences WHERE dossier_id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [dossierId, t],
    );
    const diligences = await count(
      'SELECT COUNT(*) AS n FROM diligences WHERE dossier_id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [dossierId, t],
    );
    const actions = await count(
      'SELECT COUNT(*) AS n FROM dossier_actions WHERE dossier_id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [dossierId, t],
    );
    const ai = await count(
      `SELECT COUNT(*) AS n FROM conversations_bot
        WHERE resource_type = 'dossier' AND resource_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [String(dossierId), t],
    );
    const chat = dossier.conversation_id
      ? await count(
          'SELECT COUNT(*) AS n FROM message WHERE conversationId = ? AND tenant_id = ? AND deleted_at IS NULL',
          [dossier.conversation_id, t],
        )
      : 0;
    const steps = await count(
      'SELECT COUNT(*) AS n FROM step WHERE dossier_id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [dossierId, t],
    );

    const nFactures = Number(factures?.n ?? 0);
    const paid = Number(factures?.paid ?? 0);
    const cashed = Number(factures?.cashed ?? 0);
    const currency = factures?.currency || '';
    const nDocs = Number(documents?.n ?? 0);

    const categories: DossierDeletionPreview['categories'] = [
      {
        key: 'factures',
        count: nFactures,
        details: nFactures
          ? `${plural(nFactures, 'facture')} dont ${paid} payée${paid > 1 ? 's' : ''} · ${plural(Number(factures?.payments ?? 0), 'paiement')}`
          : null,
        warning: cashed > 0
          ? `${formatAmount(cashed)} ${currency} déjà encaissés. Les écritures comptables passées sont conservées.`.trim()
          : null,
      },
      { key: 'audiences', count: audiences, details: null, warning: null },
      {
        key: 'documents',
        count: nDocs,
        details: nDocs ? `${plural(nDocs, 'document')} · ${formatSize(Number(documents?.size ?? 0))}` : null,
        warning: null,
      },
      { key: 'diligences', count: diligences, details: null, warning: null },
      { key: 'actions', count: actions, details: null, warning: null },
      { key: 'discussions_ia', count: ai, details: null, warning: null },
      {
        key: 'chat',
        count: chat,
        details: chat ? plural(chat, 'message') : null,
        warning: null,
      },
      { key: 'etapes', count: steps, details: null, warning: null },
    ].map((c) => ({ ...c, label: LABELS[c.key as DossierDeletionCategory] })) as DossierDeletionPreview['categories'];

    return {
      dossier: {
        id: dossier.id,
        dossier_number: dossier.dossier_number,
        object: dossier.object ?? null,
        client_name: dossier.client_name ?? null,
        status: Number(dossier.status),
        locked: isLocked(dossier),
      },
      categories,
    };
  }

  // ── Suppression ─────────────────────────────────────────────────────────

  async delete(tenantId: number, dossierId: number, options: DossierDeletionOptions) {
    const include = new Set(
      options.mode === 'hard'
        ? DOSSIER_DELETION_CATEGORIES
        : (options.include ?? []).filter((c) => DOSSIER_DELETION_CATEGORIES.includes(c)),
    );
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let files: string[] = [];
    try {
      const dossier = await this.findDossier(qr, tenantId, dossierId);
      if (isLocked(dossier) && !options.allowLocked) {
        throw new BadRequestException(
          'Ce dossier est clôturé ou archivé : il ne peut pas être supprimé.',
        );
      }
      let result: { deletion_id: number | null; removed: Record<string, number> };
      if (options.mode === 'hard') {
        files = await this.hardDelete(qr, tenantId, dossier);
        result = { deletion_id: null, removed: {} };
      } else {
        result = await this.softDelete(qr, tenantId, dossier, include, options.actor);
      }
      await qr.commitTransaction();
      for (const file of files) removeUploadFile(file);
      return { success: true, dossier_number: dossier.dossier_number, ...result };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** Remet en place le dossier et tous les éléments supprimés avec lui. */
  async restore(tenantId: number, deletionId: number) {
    const [row] = await this.db.query(
      'SELECT * FROM dossier_deletions WHERE id = ? AND tenant_id = ?',
      [deletionId, tenantId],
    );
    if (!row) throw new NotFoundException('Suppression introuvable.');
    if (row.restored_at) throw new BadRequestException('Ce dossier a déjà été restauré.');
    const items: Record<string, Id[]> =
      typeof row.items === 'string' ? JSON.parse(row.items) : row.items ?? {};

    await this.db.transaction(async (m) => {
      for (const [table, ids] of Object.entries(items)) {
        if (!SOFT_TABLES.has(table) || !ids?.length) continue;
        await m.query(
          `UPDATE \`${table}\` SET deleted_at = NULL WHERE tenant_id = ? AND id IN (${marks(ids)})`,
          [tenantId, ...ids],
        );
      }
      await m.query('UPDATE dossier_deletions SET restored_at = NOW() WHERE id = ?', [deletionId]);
    });
    return { success: true, dossier_id: Number(row.dossier_id), dossier_number: row.dossier_number };
  }

  /** Dernières suppressions (corbeille) d'un cabinet. */
  async listDeletions(tenantId: number, limit = 50) {
    const rows = await this.db.query(
      `SELECT id, dossier_id, dossier_number, include_categories, deleted_by, created_at, restored_at
         FROM dossier_deletions WHERE tenant_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
      [tenantId, limit],
    );
    return rows.map((r: any) => ({
      ...r,
      dossier_id: Number(r.dossier_id),
      include_categories:
        typeof r.include_categories === 'string'
          ? JSON.parse(r.include_categories)
          : r.include_categories ?? [],
    }));
  }

  // ── Corbeille ───────────────────────────────────────────────────────────

  private async softDelete(
    qr: QueryRunner,
    t: number,
    dossier: any,
    include: Set<DossierDeletionCategory>,
    actor: string,
  ) {
    const d = dossier.id;
    const items: Record<string, Id[]> = { dossiers: [d] };
    const live = (sql: string, params: any[]) => this.ids(qr, `${sql} AND deleted_at IS NULL`, params);

    if (include.has('factures')) {
      const factures = await live('SELECT id FROM factures WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
      items.factures = factures;
      if (factures.length) {
        items.paiements = await live(
          `SELECT id FROM paiements WHERE tenant_id = ? AND facture_id IN (${marks(factures)})`,
          [t, ...factures],
        );
        items.invoice_lines = await live(
          `SELECT id FROM invoice_lines WHERE tenant_id = ? AND facture_id IN (${marks(factures)})`,
          [t, ...factures],
        );
      }
    }
    if (include.has('audiences')) {
      items.audiences = await live('SELECT id FROM audiences WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    }
    if (include.has('documents')) {
      items.document_customer = await live(
        'SELECT id FROM document_customer WHERE dossier_id = ? AND tenant_id = ?',
        [d, t],
      );
    }
    if (include.has('diligences')) {
      const diligences = await live('SELECT id FROM diligences WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
      items.diligences = diligences;
      if (diligences.length) {
        items.findings = await live(
          `SELECT id FROM findings WHERE tenant_id = ? AND diligence_id IN (${marks(diligences)})`,
          [t, ...diligences],
        );
      }
    }
    if (include.has('actions')) {
      items.dossier_actions = await live('SELECT id FROM dossier_actions WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
      items.dossier_recommendations = await live(
        'SELECT id FROM dossier_recommendations WHERE dossier_id = ? AND tenant_id = ?',
        [d, t],
      );
    }
    if (include.has('discussions_ia')) {
      items.conversations_bot = await live(
        `SELECT id FROM conversations_bot WHERE resource_type = 'dossier' AND resource_id = ? AND tenant_id = ?`,
        [String(d), t],
      );
    }
    if (include.has('chat') && dossier.conversation_id) {
      items.conversation = await live('SELECT id FROM conversation WHERE id = ? AND tenant_id = ?', [
        dossier.conversation_id,
        t,
      ]);
      items.message = await live('SELECT id FROM message WHERE conversationId = ? AND tenant_id = ?', [
        dossier.conversation_id,
        t,
      ]);
    }
    if (include.has('etapes')) {
      const steps = await live('SELECT id FROM step WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
      items.step = steps;
      if (steps.length) {
        items.step_action = await live(
          `SELECT id FROM step_action WHERE tenant_id = ? AND stepId IN (${marks(steps)})`,
          [t, ...steps],
        );
      }
    }

    const removed: Record<string, number> = {};
    for (const [table, ids] of Object.entries(items)) {
      if (!ids.length) continue;
      await qr.query(
        `UPDATE \`${table}\` SET deleted_at = NOW() WHERE tenant_id = ? AND id IN (${marks(ids)})`,
        [t, ...ids],
      );
      removed[table] = ids.length;
    }
    const res = await qr.query(
      `INSERT INTO dossier_deletions (tenant_id, dossier_id, dossier_number, include_categories, items, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [t, d, dossier.dossier_number, JSON.stringify([...include]), JSON.stringify(items), actor.slice(0, 190)],
    );
    return { deletion_id: Number(res.insertId), removed };
  }

  // ── Effacement définitif (données de test) ──────────────────────────────

  /** Efface le dossier et tout ce qui s'y rattache. Renvoie les fichiers à supprimer après commit. */
  private async hardDelete(qr: QueryRunner, t: number, dossier: any): Promise<string[]> {
    const d = dossier.id;
    const run = (sql: string, params: any[]) => qr.query(sql, params);
    const del = async (table: string, column: string, ids: Id[]) => {
      if (ids.length) {
        await run(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (${marks(ids)})`, ids);
      }
    };
    const all = (sql: string, params: any[]) => this.ids(qr, sql, params);

    const factures = await all('SELECT id FROM factures WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    const paiements = factures.length
      ? await all(`SELECT id FROM paiements WHERE facture_id IN (${marks(factures)})`, factures)
      : [];
    const audiences = await all('SELECT id FROM audiences WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    const documents = await all('SELECT id FROM document_customer WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    const diligences = await all('SELECT id FROM diligences WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    const actions = await all('SELECT id FROM dossier_actions WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    const steps = await all('SELECT id FROM step WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    const aiConversations = await all(
      `SELECT id FROM conversations_bot WHERE resource_type = 'dossier' AND resource_id = ? AND tenant_id = ?`,
      [String(d), t],
    );

    const files: string[] = [];
    if (documents.length) {
      const rows = await run(
        `SELECT file_path FROM document_customer WHERE id IN (${marks(documents)})
         UNION SELECT file_path FROM document_customer_versions WHERE document_id IN (${marks(documents)})`,
        [...documents, ...documents],
      );
      files.push(...rows.map((r: any) => r.file_path).filter(Boolean));
    }

    // 1. Actions V2 et facturation V2 (FK RESTRICT vers dossiers).
    if (actions.length) {
      await run(
        `DELETE FROM dossier_action_relations WHERE action_id IN (${marks(actions)}) OR related_action_id IN (${marks(actions)})`,
        [...actions, ...actions],
      );
    }
    await run('DELETE FROM invoice_lines WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    await del('invoice_lines', 'facture_id', factures);
    for (const table of [
      'billable_items',
      'dossier_recommendations',
      'dossier_billing_rules',
      'dossier_billing_profiles',
      'case_workflow_events',
      'dossier_closure_reviews',
      'case_workflow_migration_runs',
    ]) {
      await run(`DELETE FROM \`${table}\` WHERE dossier_id = ? AND tenant_id = ?`, [d, t]);
    }
    await del('dossier_actions', 'id', actions);

    // 2. Paiements, commissions, écritures comptables, puis factures (avoirs d'abord).
    if (factures.length || paiements.length) {
      const sources = [...factures, ...paiements].map(String);
      await run(
        `DELETE FROM ecritures_comptables WHERE tenant_id = ? AND source_module IN ('facture', 'paiement')
           AND source_id IN (${marks(sources)})`,
        [t, ...sources],
      );
      await run(
        `DELETE FROM referral_commission WHERE ${[
          factures.length ? `facture_id IN (${marks(factures)})` : null,
          paiements.length ? `paiement_id IN (${marks(paiements)})` : null,
        ]
          .filter(Boolean)
          .join(' OR ')}`,
        [...factures, ...paiements],
      );
    }
    await del('paiements', 'id', paiements);
    if (factures.length) {
      await run(
        `DELETE FROM factures WHERE original_facture_id IN (${marks(factures)})`,
        factures,
      );
    }
    await del('factures', 'id', factures);

    // 3. Diligences (findings d'abord).
    if (diligences.length || documents.length) {
      await run(
        `DELETE FROM findings WHERE ${[
          diligences.length ? `diligence_id IN (${marks(diligences)})` : null,
          documents.length ? `document_id IN (${marks(documents)})` : null,
        ]
          .filter(Boolean)
          .join(' OR ')}`,
        [...diligences, ...documents],
      );
    }
    await del('diligences', 'id', diligences);

    // 4. Audiences.
    await del('dossier_action_audience_links', 'audience_id', audiences);
    await del('audiences', 'id', audiences);

    // 5. Documents (versions et notes en cascade).
    if (documents.length) {
      for (const table of [
        'dossier_action_document_links',
        'audience_decision_documents',
        'audience_documents',
        'diligence_documents',
        'procedure_instance_documents',
        'stage_visit_documents',
        'step_documents',
        'sub_stage_documents',
      ]) {
        await del(table, 'document_id', documents);
      }
      await run(
        `UPDATE document_customer SET previous_version_id = NULL WHERE previous_version_id IN (${marks(documents)})`,
        documents,
      );
      await del('document_customer', 'id', documents);
    }

    // 6. Étapes de l'ancien parcours.
    await del('step_action', 'stepId', steps);
    await del('step', 'id', steps);

    // 7. Discussions IA.
    if (aiConversations.length) {
      await run(
        `DELETE FROM conversation_messages WHERE conversation_id IN (${marks(aiConversations)}) OR conversationId IN (${marks(aiConversations)})`,
        [...aiConversations, ...aiConversations],
      );
      await del('ai_conversation_documents', 'conversation_id', aiConversations);
      await del('conversations_bot', 'id', aiConversations);
    }

    // 8. Rattachements directs, puis le dossier.
    await run('DELETE FROM dossier_referral WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    await run('DELETE FROM client_messages WHERE dossier_id = ? AND tenant_id = ?', [d, t]);
    await run('UPDATE expense_line SET dossier_id = NULL WHERE dossier_id = ?', [d]);
    await run('UPDATE payslip_line SET dossier_id = NULL WHERE dossier_id = ?', [d]);
    await run('DELETE FROM dossiers WHERE id = ? AND tenant_id = ?', [d, t]);

    // 9. Conversation d'équipe et instance de procédure : best-effort, une
    // donnée partagée inattendue ne doit pas bloquer l'effacement du dossier.
    if (dossier.conversation_id) {
      const attachments = await run(
        `SELECT a.filePath FROM attachment a JOIN message m ON m.id = a.messageId WHERE m.conversationId = ?`,
        [dossier.conversation_id],
      );
      const ok = await this.bestEffort(qr, 'chat', async () => {
        await run('DELETE FROM message WHERE conversationId = ?', [dossier.conversation_id]);
        await run('DELETE FROM conversation WHERE id = ? AND tenant_id = ?', [dossier.conversation_id, t]);
      });
      if (ok) files.push(...attachments.map((a: any) => a.filePath).filter(Boolean));
    }
    if (dossier.procedureInstanceId) {
      await this.bestEffort(qr, 'procedure', async () => {
        const instance = dossier.procedureInstanceId;
        for (const table of ['history_entries', 'tasks', 'decisions']) {
          await run(`DELETE FROM \`${table}\` WHERE instanceId = ?`, [instance]);
        }
        await run('DELETE FROM stage_visits WHERE instanceId = ?', [instance]);
        await run('DELETE FROM procedure_instances WHERE id = ? AND tenant_id = ?', [instance, t]);
      });
    }
    return files;
  }

  // ── Utilitaires ─────────────────────────────────────────────────────────

  private async findDossier(db: DataSource | QueryRunner, tenantId: number, dossierId: number) {
    const [row] = await db.query(
      `SELECT d.id, d.dossier_number, d.object, d.status, d.is_archived, d.conversation_id,
              d.procedureInstanceId, c.full_name AS client_name
         FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id
        WHERE d.id = ? AND d.tenant_id = ? AND d.deleted_at IS NULL`,
      [dossierId, tenantId],
    );
    if (!row) throw new NotFoundException('Ce dossier est introuvable ou a déjà été supprimé.');
    return row;
  }

  private async ids(qr: QueryRunner, sql: string, params: any[]): Promise<Id[]> {
    const rows: Array<{ id: Id }> = await qr.query(sql, params);
    return rows.map((r) => r.id);
  }

  private async bestEffort(qr: QueryRunner, name: string, fn: () => Promise<void>) {
    const savepoint = `sp_${name}`;
    await qr.query(`SAVEPOINT ${savepoint}`);
    try {
      await fn();
      await qr.query(`RELEASE SAVEPOINT ${savepoint}`);
      return true;
    } catch (err) {
      await qr.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      this.logger.warn(`Effacement ${name} ignoré : ${(err as Error).message}`);
      return false;
    }
  }
}

/** Tables que la corbeille peut marquer puis restaurer. */
const SOFT_TABLES = new Set([
  'dossiers',
  'factures',
  'paiements',
  'invoice_lines',
  'audiences',
  'document_customer',
  'diligences',
  'findings',
  'dossier_actions',
  'dossier_recommendations',
  'conversations_bot',
  'conversation',
  'message',
  'step',
  'step_action',
]);

function isLocked(dossier: any) {
  const status = Number(dossier.status);
  return (
    status === DossierStatus.CLOSED ||
    status === DossierStatus.ARCHIVED ||
    !!Number(dossier.is_archived ?? 0)
  );
}

function marks(ids: unknown[]) {
  return ids.map(() => '?').join(', ');
}

function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function formatAmount(n: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Supprime un fichier d'upload (chemin absolu ou relatif à `uploads/`), puis
 * les dossiers devenus vides au-dessus de lui, sans remonter au-delà de
 * `uploads/docs`.
 */
export function removeUploadFile(path: string) {
  try {
    const root = normalize(UPLOAD_PATH);
    const full = isAbsolute(path)
      ? normalize(path)
      : normalize(join(root, path.replace(/^[\\/]*(uploads[\\/])?/, '')));
    if (!full.startsWith(root)) return;
    if (existsSync(full)) unlinkSync(full);
    const stop = normalize(UPLOAD_DOCS_PATH);
    let dir = dirname(full);
    while (dir.startsWith(stop) && dir !== stop && existsSync(dir) && !readdirSync(dir).length) {
      rmdirSync(dir);
      dir = dirname(dir);
    }
  } catch {
    /* best-effort */
  }
}
