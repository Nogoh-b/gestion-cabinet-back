import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DataSource, EntityManager } from 'typeorm';
import {
  UPLOAD_DOCS_FOLDER_NAME,
  UPLOAD_FOLDER_NAME,
  UPLOAD_PATH,
} from 'src/core/common/constants/constants';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import {
  DossierDeletionService,
  removeUploadFile,
} from 'src/modules/dossiers/deletion/dossier-deletion.service';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformPrincipal } from '../common/platform-principal';

/** Types de données de test, dans l'ordre de génération. */
export const SAMPLE_TYPES = [
  'users',
  'clients',
  'dossiers',
  'audiences',
  'actions',
  'documents',
  'discussions_ia',
  'factures',
] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];
export type SampleSize = 'petit' | 'moyen' | 'grand';

/** Type → types dont il dépend pour être généré. */
const REQUIRES: Partial<Record<SampleType, SampleType[]>> = {
  dossiers: ['clients'],
  audiences: ['dossiers'],
  actions: ['dossiers'],
  documents: ['dossiers'],
  discussions_ia: ['dossiers'],
  factures: ['dossiers'],
};

const LABELS: Record<SampleType, string> = {
  users: 'Utilisateurs',
  clients: 'Clients',
  dossiers: 'Dossiers',
  audiences: 'Audiences',
  actions: 'Actions et diligences',
  documents: 'Documents',
  discussions_ia: 'Discussions IA',
  factures: 'Factures',
};

const SIZES: Record<SampleSize, { users: number; clients: number; dossiers: number }> = {
  petit: { users: 3, clients: 4, dossiers: 6 },
  moyen: { users: 6, clients: 10, dossiers: 15 },
  grand: { users: 10, clients: 25, dossiers: 40 },
};

// ── Jeux de valeurs (tous les statuts apparaissent, en rotation) ──────────
const FIRST_NAMES = ['Aïcha', 'Paul', 'Mireille', 'Serge', 'Nadège', 'Hervé', 'Clarisse', 'Boris', 'Estelle', 'Jacques', 'Laure', 'Didier'];
const LAST_NAMES = ['Mbarga', 'Nkoulou', 'Tchoua', 'Fotso', 'Essomba', 'Ngo Bassa', 'Kamga', 'Owona', 'Djoumessi', 'Atangana', 'Biya', 'Ekambi'];
const COMPANIES = ['Sotrabois SARL', 'Agro-Sahel SA', 'Imprimerie du Littoral', 'Transcam Logistique', 'Hôtel Les Palmiers', 'BTP Mungo'];
const POSITIONS = ['avocat', 'collaborateur', 'juriste', 'secretaire', 'stagiaire', 'comptable'];
const ROLES = ['avocat', 'collaborateur', 'juriste', 'secretaire', 'stagiaire', 'comptable'];
/** Employé : 1 actif, 0 inactif, -1 suspendu, 2 congés. */
const EMPLOYEE_STATUSES = [1, 1, 0, -1, 2];
/** Client : 1 actif, 0 inactif, -1 suspendu. */
const CLIENT_STATUSES = [1, 1, 1, 0, -1];
/** Dossier : statut, phase. */
const DOSSIER_STATES: Array<{ status: number; phase: 'OPENING' | 'TREATMENT' | 'CLOSED' }> = [
  { status: 0, phase: 'OPENING' },
  { status: 1, phase: 'TREATMENT' },
  { status: 2, phase: 'TREATMENT' },
  { status: 3, phase: 'TREATMENT' },
  { status: 4, phase: 'TREATMENT' },
  { status: 5, phase: 'TREATMENT' },
  { status: 7, phase: 'TREATMENT' },
  { status: 8, phase: 'CLOSED' },
  { status: 9, phase: 'CLOSED' },
  { status: 10, phase: 'CLOSED' },
];
const OBJECTS = [
  'Recouvrement de créance commerciale',
  'Litige foncier — titre de propriété',
  'Licenciement abusif',
  'Bail commercial — expulsion',
  'Accident de la circulation — indemnisation',
  'Succession et partage',
  'Contrefaçon de marque',
  'Contrat de prestation non exécuté',
];
const COURTS = ['TPI de Douala-Bonanjo', 'TGI du Mfoundi', 'Cour d’appel du Littoral', 'Tribunal de commerce de Douala'];
/** Audience : 0 programmée, 1 tenue, 2 reportée, 3 annulée. */
const AUDIENCE_STATUSES = [0, 1, 2, 3, 0];
const DILIGENCE_STATUSES = ['draft', 'in_progress', 'review', 'completed', 'cancelled'];
const DILIGENCE_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const ACTION_STATUSES = ['TODO', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
/** Document : 1 accepté, 0 en attente, 2 refusé. */
const DOCUMENT_STATUSES = [1, 1, 0, 2];
const DOCUMENT_NAMES = ['Assignation', 'Contrat signé', 'Mise en demeure', 'Procès-verbal', 'Conclusions', 'Pièce d’identité'];
/** Facture : 0 brouillon, 1 envoyée, 2 partiellement payée, 3 payée, 4 impayée, 5 annulée. */
const INVOICE_STATUSES = [0, 1, 2, 3, 4, 5, 3];
const AI_QUESTIONS = [
  ['Résume-moi ce dossier.', 'Le dossier porte sur un litige commercial. Prochaine étape : audience de mise en état.'],
  ['Quels documents manquent ?', 'Il manque la mise en demeure signée et le justificatif de créance.'],
  ['Prépare un courrier au client.', 'Voici un projet de courrier informant le client de l’avancement de son dossier.'],
];

const pick = <T>(list: T[], i: number) => list[i % list.length];
const day = 24 * 60 * 60 * 1000;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number, step = 5000) => Math.round(n / step) * step;

interface Ctx {
  m: EntityManager;
  tenantId: number;
  batch: string;
  /** Six caractères du lot : rend les codes et e-mails uniques. */
  tag: string;
  actorUserId: number | null;
  cabinet: { name: string; currency: string };
  created: Partial<Record<SampleType, number>>;
  skipped: string[];
  files: string[];
}

/**
 * Données de test d'un cabinet (console plateforme).
 *
 * Insertion en SQL explicite, dans une transaction : pas de service métier,
 * qui vérifierait les quotas et enverrait des identifiants par e-mail aux faux
 * utilisateurs. Chaque ligne principale est tracée dans `sample_data_records`
 * pour que le retrait n'efface que ces données-là, jamais les vraies.
 */
@Injectable()
export class PlatformSampleDataService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly deletion: DossierDeletionService,
  ) {}

  // ── État ────────────────────────────────────────────────────────────────

  async summary(tenantId: number) {
    await this.cabinet(this.db.manager, tenantId);
    await this.prune(tenantId);
    const rows: Array<{ entity: string; n: string }> = await this.db.query(
      'SELECT entity, COUNT(*) AS n FROM sample_data_records WHERE tenant_id = ? GROUP BY entity',
      [tenantId],
    );
    const counts = Object.fromEntries(rows.map((r) => [r.entity, Number(r.n)]));
    const batches = await this.db.query(
      `SELECT batch_id, MIN(created_at) AS created_at, COUNT(*) AS items
         FROM sample_data_records WHERE tenant_id = ?
        GROUP BY batch_id ORDER BY created_at DESC LIMIT 20`,
      [tenantId],
    );
    return {
      types: SAMPLE_TYPES.map((type) => ({
        type,
        label: LABELS[type],
        count: counts[type] ?? 0,
        requires: REQUIRES[type] ?? [],
      })),
      batches: batches.map((b: any) => ({ ...b, items: Number(b.items) })),
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  // ── Génération ──────────────────────────────────────────────────────────

  async generate(tenantId: number, types: SampleType[], size: SampleSize, admin: PlatformPrincipal) {
    const wanted = new Set<SampleType>();
    const add = (t: SampleType) => {
      if (wanted.has(t)) return;
      wanted.add(t);
      (REQUIRES[t] ?? []).forEach(add);
    };
    types.filter((t) => SAMPLE_TYPES.includes(t)).forEach(add);
    if (!wanted.size) throw new BadRequestException('Choisissez au moins un type de données à générer.');
    const volume = SIZES[size] ?? SIZES.petit;
    const batch = randomUUID();
    const files: string[] = [];

    const ctx = await this.db.transaction(async (m) => {
      const [admin0] = await m.query(
        `SELECT id FROM \`user\` WHERE tenant_id = ? AND role = 'admin' AND deleted_at IS NULL ORDER BY id LIMIT 1`,
        [tenantId],
      );
      const c: Ctx = {
        m,
        tenantId,
        batch,
        tag: batch.replace(/-/g, '').slice(0, 6).toUpperCase(),
        actorUserId: admin0?.id ?? null,
        cabinet: await this.cabinet(m, tenantId),
        created: {},
        skipped: [],
        files,
      };

      const users = wanted.has('users') ? await this.createUsers(c, volume.users) : [];
      const clients = wanted.has('clients') ? await this.createClients(c, volume.clients) : [];
      let dossiers: any[] = [];
      if (wanted.has('dossiers')) {
        const pool = clients.length ? clients : await this.tracked(c, 'clients', 'customer');
        const lawyers = users.length ? users : await this.lawyers(c);
        dossiers = await this.createDossiers(c, volume.dossiers, pool, lawyers);
      }
      const targets = dossiers.length ? dossiers : await this.trackedDossiers(c);
      if (wanted.has('audiences')) await this.createAudiences(c, targets);
      if (wanted.has('actions')) await this.createActions(c, targets, users.length ? users : await this.lawyers(c));
      if (wanted.has('documents')) await this.createDocuments(c, targets);
      if (wanted.has('discussions_ia')) await this.createAiDiscussions(c, targets);
      if (wanted.has('factures')) await this.createInvoices(c, targets);
      return c;
    }).catch((err) => {
      // La transaction est annulée : on retire aussi les fichiers déjà écrits.
      files.forEach(removeUploadFile);
      throw err;
    });

    PlatformAuditContext.set({
      action: 'cabinet.sample_data.generate',
      targetType: 'cabinet',
      targetId: tenantId,
      cabinetId: tenantId,
      summary: `Données de test générées (${size}) par ${admin.email} : ${Object.entries(ctx.created)
        .map(([t, n]) => `${n} ${LABELS[t as SampleType].toLowerCase()}`)
        .join(', ')}`,
    });
    return {
      batch_id: batch,
      created: SAMPLE_TYPES.filter((t) => ctx.created[t]).map((t) => ({
        type: t,
        label: LABELS[t],
        count: ctx.created[t]!,
      })),
      skipped: ctx.skipped,
    };
  }

  // ── Retrait ─────────────────────────────────────────────────────────────

  /** Retire un type (et ce qui en dépend) ou, sans type, toutes les données de test. */
  async remove(tenantId: number, type: SampleType | undefined, admin: PlatformPrincipal) {
    await this.cabinet(this.db.manager, tenantId);
    if (type && !SAMPLE_TYPES.includes(type)) throw new BadRequestException('Type de données inconnu.');
    const before = (await this.summary(tenantId)).types;
    const ids = (entity: SampleType) =>
      this.db
        .query('SELECT entity_id FROM sample_data_records WHERE tenant_id = ? AND entity = ?', [tenantId, entity])
        .then((rows: any[]) => rows.map((r) => r.entity_id as string));
    const files: string[] = [];

    // Les dossiers (et tout ce qu'ils contiennent) passent par l'effacement
    // définitif du service de suppression : même ordre, mêmes garde-fous.
    const removeDossiers = async (dossierIds: Array<string | number>) => {
      for (const id of dossierIds) {
        // Un dossier de test mis à la corbeille est effacé lui aussi (sinon il
        // garde une référence vers son client et bloque le retrait).
        await this.db.query('UPDATE dossiers SET deleted_at = NULL WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        await this.db.query('DELETE FROM dossier_deletions WHERE dossier_id = ? AND tenant_id = ?', [id, tenantId]);
        await this.deletion
          .delete(tenantId, Number(id), { include: [], mode: 'hard', actor: admin.email, allowLocked: true })
          .catch((err) => {
            if (!(err instanceof NotFoundException)) throw err;
          });
      }
    };

    if (!type || type === 'clients') {
      const clients = await ids('clients');
      if (clients.length) {
        const dossiers = await this.db.query(
          `SELECT id FROM dossiers WHERE tenant_id = ? AND client_id IN (${marks(clients)})`,
          [tenantId, ...clients],
        );
        await removeDossiers(dossiers.map((d: any) => d.id));
      }
    }
    if (!type || type === 'dossiers' || type === 'clients') {
      await removeDossiers(await ids('dossiers'));
    }

    await this.db.transaction(async (m) => {
      const one = async (entity: SampleType) => {
        const list = await ids(entity);
        if (list.length) files.push(...(await this.removeEntities(m, tenantId, entity, list)));
      };
      if (!type) {
        for (const t of ['factures', 'audiences', 'actions', 'documents', 'discussions_ia', 'clients', 'users'] as SampleType[]) {
          await one(t);
        }
      } else if (type === 'clients') {
        await one('clients');
      } else if (type !== 'dossiers') {
        await one(type);
      }
    });

    for (const f of files) removeUploadFile(f);
    await this.prune(tenantId);
    if (!type) {
      await this.db.query('DELETE FROM sample_data_records WHERE tenant_id = ?', [tenantId]);
    }
    const after = (await this.summary(tenantId)).types;
    PlatformAuditContext.set({
      action: 'cabinet.sample_data.remove',
      targetType: 'cabinet',
      targetId: tenantId,
      cabinetId: tenantId,
      summary: type
        ? `Données de test retirées (${LABELS[type].toLowerCase()} et dépendances) par ${admin.email}`
        : `Toutes les données de test réinitialisées par ${admin.email}`,
      before,
      after,
    });
    return {
      removed: before
        .map((b) => ({ type: b.type, label: b.label, count: b.count - (after.find((a) => a.type === b.type)?.count ?? 0) }))
        .filter((r) => r.count > 0),
    };
  }

  /** Efface les lignes d'un type (hors dossiers). Renvoie les fichiers à supprimer. */
  private async removeEntities(m: EntityManager, t: number, entity: SampleType, ids: string[]): Promise<string[]> {
    const run = (sql: string, params: any[] = []) => m.query(sql, params);
    const files: string[] = [];
    switch (entity) {
      case 'factures': {
        const paiements = (await run(`SELECT id FROM paiements WHERE facture_id IN (${marks(ids)})`, ids)).map((r: any) => r.id);
        const sources = [...ids, ...paiements];
        await run(
          `DELETE FROM ecritures_comptables WHERE tenant_id = ? AND source_module IN ('facture', 'paiement') AND source_id IN (${marks(sources)})`,
          [t, ...sources],
        );
        await run(`DELETE FROM invoice_lines WHERE facture_id IN (${marks(ids)})`, ids);
        await run(`DELETE FROM paiements WHERE facture_id IN (${marks(ids)})`, ids);
        await run(`DELETE FROM factures WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        break;
      }
      case 'audiences':
        await run(`DELETE FROM dossier_action_audience_links WHERE audience_id IN (${marks(ids)})`, ids);
        await run(`DELETE FROM audiences WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        break;
      case 'actions': {
        const diligences = ids.filter((id) => id.startsWith('d:')).map((id) => id.slice(2));
        const actions = ids.filter((id) => id.startsWith('a:')).map((id) => id.slice(2));
        if (diligences.length) {
          await run(`DELETE FROM findings WHERE diligence_id IN (${marks(diligences)})`, diligences);
          await run(`DELETE FROM diligences WHERE tenant_id = ? AND id IN (${marks(diligences)})`, [t, ...diligences]);
        }
        if (actions.length) {
          await run(
            `DELETE FROM dossier_action_relations WHERE action_id IN (${marks(actions)}) OR related_action_id IN (${marks(actions)})`,
            [...actions, ...actions],
          );
          await run(`DELETE FROM dossier_actions WHERE tenant_id = ? AND id IN (${marks(actions)})`, [t, ...actions]);
        }
        break;
      }
      case 'documents': {
        const rows = await run(`SELECT file_path FROM document_customer WHERE id IN (${marks(ids)})`, ids);
        files.push(...rows.map((r: any) => r.file_path).filter(Boolean));
        for (const table of ['dossier_action_document_links', 'audience_documents', 'audience_decision_documents', 'diligence_documents', 'step_documents', 'findings']) {
          await run(`DELETE FROM \`${table}\` WHERE document_id IN (${marks(ids)})`, ids);
        }
        await run(`DELETE FROM document_customer WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        break;
      }
      case 'discussions_ia':
        await run(
          `DELETE FROM conversation_messages WHERE conversation_id IN (${marks(ids)}) OR conversationId IN (${marks(ids)})`,
          [...ids, ...ids],
        );
        await run(`DELETE FROM ai_conversation_documents WHERE conversation_id IN (${marks(ids)})`, ids);
        await run(`DELETE FROM conversations_bot WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        break;
      case 'clients':
        await run(`DELETE FROM client_messages WHERE customer_id IN (${marks(ids)})`, ids);
        await run(`UPDATE document_customer SET customer_id = NULL WHERE customer_id IN (${marks(ids)})`, ids);
        await run(`UPDATE \`user\` SET customer_id = NULL WHERE customer_id IN (${marks(ids)})`, ids);
        await run(`DELETE FROM customer WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        break;
      case 'users':
        // Les dossiers réels gardés n'ont plus d'avocat référent de test.
        await run(`UPDATE dossiers SET lawyer_id = NULL WHERE lawyer_id IN (${marks(ids)})`, ids);
        await run(`UPDATE diligences SET assigned_lawyer_id = NULL WHERE assigned_lawyer_id IN (${marks(ids)})`, ids);
        await run(`UPDATE document_customer SET uploaded_by_id = NULL WHERE uploaded_by_id IN (${marks(ids)})`, ids);
        for (const table of ['dossier_collaborators', 'user_settings', 'user_notifications', 'notifications', 'activities_user', 'user_role_assignment']) {
          await run(`DELETE FROM \`${table}\` WHERE user_id IN (${marks(ids)})`, ids);
        }
        await run(`DELETE FROM dossier_access_grant WHERE employee_id IN (${marks(ids)})`, ids);
        await run(`UPDATE \`user\` SET employeeId = NULL WHERE id IN (${marks(ids)})`, ids);
        await run(`DELETE FROM employee WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        await run(`DELETE FROM \`user\` WHERE tenant_id = ? AND id IN (${marks(ids)})`, [t, ...ids]);
        break;
    }
    await run(
      `DELETE FROM sample_data_records WHERE tenant_id = ? AND entity = ? AND entity_id IN (${marks(ids)})`,
      [t, entity, ...ids],
    );
    return files;
  }

  /** Oublie les traces dont la ligne n'existe plus (effacée en cascade ou à la main). */
  private async prune(t: number) {
    const checks: Array<[SampleType, string]> = [
      ['users', 'SELECT 1 FROM `user` x WHERE x.id = r.entity_id'],
      ['clients', 'SELECT 1 FROM customer x WHERE x.id = r.entity_id'],
      ['dossiers', 'SELECT 1 FROM dossiers x WHERE x.id = r.entity_id'],
      ['audiences', 'SELECT 1 FROM audiences x WHERE x.id = r.entity_id'],
      ['documents', 'SELECT 1 FROM document_customer x WHERE x.id = r.entity_id'],
      ['discussions_ia', 'SELECT 1 FROM conversations_bot x WHERE x.id = r.entity_id'],
      ['factures', 'SELECT 1 FROM factures x WHERE x.id = r.entity_id'],
    ];
    for (const [entity, exists] of checks) {
      await this.db.query(
        `DELETE r FROM sample_data_records r WHERE r.tenant_id = ? AND r.entity = ? AND NOT EXISTS (${exists})`,
        [t, entity],
      );
    }
    await this.db.query(
      `DELETE r FROM sample_data_records r WHERE r.tenant_id = ? AND r.entity = 'actions' AND NOT (
         (r.entity_id LIKE 'd:%' AND EXISTS (SELECT 1 FROM diligences x WHERE x.id = SUBSTRING(r.entity_id, 3)))
         OR (r.entity_id LIKE 'a:%' AND EXISTS (SELECT 1 FROM dossier_actions x WHERE x.id = SUBSTRING(r.entity_id, 3))))`,
      [t],
    );
  }

  // ── Création par type ───────────────────────────────────────────────────

  private async createUsers(c: Ctx, count: number) {
    const out: Array<{ id: number }> = [];
    for (let i = 0; i < count; i++) {
      const first = pick(FIRST_NAMES, i);
      const last = pick(LAST_NAMES, i + 3);
      const login = `test.${c.tag.toLowerCase()}.${i + 1}`;
      const status = pick(EMPLOYEE_STATUSES, i);
      const res = await c.m.query(
        `INSERT INTO \`user\` (username, status, email, first_name, last_name, full_name, role, tenant_id, mfa_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [login, status === 1 || status === 2 ? 1 : 0, `${login}@exemple.test`, first, `${last} [TEST]`, `${first} ${last} [TEST]`, pick(ROLES, i), c.tenantId],
      );
      const id = Number(res.insertId);
      await c.m.query(
        `INSERT INTO employee (id, hire_date, status, position, employee_number, is_available, tenant_id)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [id, dateOnly(new Date(Date.now() - (i + 1) * 120 * day)), status, pick(POSITIONS, i), `TST-${c.tag}-${i + 1}`, c.tenantId],
      );
      await c.m.query('UPDATE `user` SET employeeId = ? WHERE id = ?', [id, id]);
      await this.track(c, 'users', id);
      out.push({ id });
    }
    c.created.users = count;
    return out;
  }

  private async createClients(c: Ctx, count: number) {
    const types: Array<{ id: number; code: string }> = await c.m.query(
      `SELECT id, code FROM type_customer WHERE deleted_at IS NULL AND tenant_id IN (?, 1) ORDER BY tenant_id = ? DESC, id`,
      [c.tenantId, c.tenantId],
    );
    const person = types.find((t) => /PARTICULIER|PH/i.test(t.code))?.id ?? types[0]?.id ?? null;
    const company = types.find((t) => /ENTREPRISE|MORAL/i.test(t.code))?.id ?? person;
    const out: Array<{ id: number }> = [];
    for (let i = 0; i < count; i++) {
      const isCompany = i % 3 === 2;
      const first = pick(FIRST_NAMES, i + 5);
      const last = isCompany ? pick(COMPANIES, i) : pick(LAST_NAMES, i);
      const fullName = isCompany ? `${last} [TEST]` : `${first} ${last} [TEST]`;
      const res = await c.m.query(
        `INSERT INTO customer (last_name, first_name, full_name, customer_code, email, number_phone_1, status,
                               type_customer_id, company_name, address, country, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Cameroun', ?)`,
        [
          isCompany ? fullName : `${last} [TEST]`,
          isCompany ? '-' : first,
          fullName,
          `TEST-${c.tag}-CLI-${String(i + 1).padStart(3, '0')}`,
          `client.${c.tag.toLowerCase()}.${i + 1}@exemple.test`,
          `+2376990${String(10000 + i).slice(-5)}`,
          pick(CLIENT_STATUSES, i),
          isCompany ? company : person,
          isCompany ? last : null,
          `${10 + i} rue des Tests, Douala`,
          c.tenantId,
        ],
      );
      const id = Number(res.insertId);
      await this.track(c, 'clients', id);
      out.push({ id });
    }
    c.created.clients = count;
    return out;
  }

  private async createDossiers(c: Ctx, count: number, clients: Array<{ id: number }>, lawyers: Array<{ id: number }>) {
    if (!clients.length) {
      c.skipped.push('Dossiers ignorés : aucun client de test disponible.');
      return [];
    }
    const [feature] = await c.m.query(
      'SELECT enabled, default_for_new_dossiers FROM case_workflow_features WHERE tenant_id = ? AND deleted_at IS NULL',
      [c.tenantId],
    );
    const engine = feature && Number(feature.enabled) && Number(feature.default_for_new_dossiers) ? 'ACTIONS_V2' : 'LEGACY';
    const [{ n }] = await c.m.query(
      `SELECT COUNT(*) AS n FROM dossiers WHERE tenant_id = ? AND dossier_number LIKE 'TEST-DOS-%'`,
      [c.tenantId],
    );
    const out: any[] = [];
    for (let i = 0; i < count; i++) {
      const state = pick(DOSSIER_STATES, i);
      const number = `TEST-DOS-${String(Number(n) + i + 1).padStart(4, '0')}`;
      const opened = new Date(Date.now() - (30 + i * 17) * day);
      const client = pick(clients, i);
      const res = await c.m.query(
        `INSERT INTO dossiers (dossier_number, object, description, court_name, opposing_party_name, opening_date,
                               closing_date, client_id, lawyer_id, status, priority_level, danger_level, tenant_id,
                               lifecycle_phase, workflow_engine, opening_validated_at, created_by_id, is_archived,
                               procedure_costs, budget_estimate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          number,
          `[TEST] ${pick(OBJECTS, i)}`,
          'Dossier fictif généré par la plateforme pour tester l’application.',
          pick(COURTS, i),
          `${pick(COMPANIES, i + 2)} (partie adverse fictive)`,
          dateOnly(opened),
          state.phase === 'CLOSED' ? dateOnly(new Date(opened.getTime() + 20 * day)) : null,
          client.id,
          lawyers.length ? pick(lawyers, i).id : null,
          String(state.status),
          (i % 3) + 1,
          String(i % 4),
          c.tenantId,
          state.phase,
          engine,
          state.phase === 'OPENING' ? null : opened,
          c.actorUserId,
          state.status === 9 ? 1 : 0,
          round(500000 + (i % 7) * 350000),
        ],
      );
      const dossier = { id: Number(res.insertId), number, client_id: client.id, status: state.status, engine, phase: state.phase };
      await this.track(c, 'dossiers', dossier.id);
      out.push(dossier);
    }
    c.created.dossiers = count;
    return out;
  }

  private async createAudiences(c: Ctx, dossiers: any[]) {
    let n = 0;
    for (const [i, d] of dossiers.entries()) {
      const perDossier = d.status === 0 ? 0 : (i % 2) + 1;
      for (let k = 0; k < perDossier; k++) {
        const status = pick(AUDIENCE_STATUSES, i + k);
        // Passées si tenues ou annulées, à venir si programmées ou reportées.
        const offset = status === 1 || status === 3 ? -(10 + i * 3 + k * 7) : 5 + i * 2 + k * 9;
        const date = new Date(Date.now() + offset * day);
        // Type compatible avec le statut du dossier (conciliation en amiable, jugement au contentieux).
        const type = d.status === 2 || d.status === 1 ? 3 : d.status === 3 || d.status === 5 ? (k ? 2 : 0) : 0;
        const res = await c.m.query(
          `INSERT INTO audiences (audience_date, audience_time, room, type, status, notes, judge_name, dossier_id,
                                  decision, postponed_to, duration_minutes, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dateOnly(date),
            pick(['08:30', '09:00', '10:30', '14:00'], i + k),
            `Salle ${1 + ((i + k) % 4)}`,
            String(type),
            String(status),
            '[TEST] Audience fictive.',
            `Juge ${pick(LAST_NAMES, i + k + 4)}`,
            d.id,
            status === 1 ? 'Renvoi pour plaidoiries.' : null,
            status === 2 ? dateOnly(new Date(date.getTime() + 21 * day)) : null,
            60,
            c.tenantId,
          ],
        );
        await this.track(c, 'audiences', Number(res.insertId));
        n++;
      }
    }
    c.created.audiences = n;
  }

  private async createActions(c: Ctx, dossiers: any[], lawyers: Array<{ id: number }>) {
    let n = 0;
    for (const [i, d] of dossiers.entries()) {
      for (let k = 0; k < (i % 2) + 1; k++) {
        const status = pick(DILIGENCE_STATUSES, i + k);
        const start = new Date(Date.now() - (20 - k * 5) * day);
        const res = await c.m.query(
          `INSERT INTO diligences (title, description, type, status, priority, start_date, deadline, completion_date,
                                   dossier_id, assigned_lawyer_id, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `[TEST] ${pick(['Collecter les pièces', 'Rédiger les conclusions', 'Relancer la partie adverse', 'Préparer l’audience'], i + k)}`,
            'Diligence fictive générée pour les tests.',
            pick(['general', 'litigation', 'contract', 'compliance'], i + k),
            status,
            pick(DILIGENCE_PRIORITIES, i + k),
            dateOnly(start),
            dateOnly(new Date(start.getTime() + (10 + k * 10) * day)),
            status === 'completed' ? dateOnly(new Date(start.getTime() + 8 * day)) : null,
            d.id,
            lawyers.length ? pick(lawyers, i + k).id : null,
            c.tenantId,
          ],
        );
        await this.track(c, 'actions', `d:${res.insertId}`);
        n++;
      }
    }

    // Actions du traitement orienté actions (V2) : seulement pour les dossiers V2 ouverts.
    const v2 = dossiers.filter((d) => d.engine === 'ACTIONS_V2' && d.phase === 'TREATMENT');
    if (v2.length) {
      const definitions: any[] = await c.m.query(
        `SELECT id, code, label, version FROM case_action_definitions
          WHERE tenant_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY id LIMIT 8`,
        [c.tenantId],
      );
      if (!definitions.length) {
        c.skipped.push('Actions V2 ignorées : aucune définition d’action active dans ce cabinet.');
      } else {
        for (const [i, d] of v2.entries()) {
          for (let k = 0; k < 2; k++) {
            const def = pick(definitions, i + k);
            const status = pick(ACTION_STATUSES, i + k);
            const id = randomUUID();
            await c.m.query(
              `INSERT INTO dossier_actions (id, tenant_id, dossier_id, definition_id, definition_code, definition_label,
                                            definition_version, title, responsible_user_id, status, priority, due_at,
                                            started_at, completed_at, cancelled_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                c.tenantId,
                d.id,
                def.id,
                def.code,
                def.label,
                def.version ?? 1,
                `[TEST] ${def.label}`,
                lawyers.length ? pick(lawyers, i).id : c.actorUserId,
                status,
                pick(['LOW', 'NORMAL', 'HIGH', 'CRITICAL'], i + k),
                new Date(Date.now() + (k ? 10 : -3) * day),
                status === 'TODO' ? null : new Date(Date.now() - 5 * day),
                status === 'COMPLETED' ? new Date(Date.now() - day) : null,
                status === 'CANCELLED' ? new Date(Date.now() - day) : null,
              ],
            );
            await this.track(c, 'actions', `a:${id}`);
            n++;
          }
        }
      }
    } else if (dossiers.length) {
      c.skipped.push('Actions V2 non générées : le cabinet n’utilise pas le traitement orienté actions (seules des diligences ont été créées).');
    }
    c.created.actions = n;
  }

  private async createDocuments(c: Ctx, dossiers: any[]) {
    const cabinetDir = FilesUtil.sanitizeName(c.cabinet.name || 'cabinet').toLowerCase() || 'cabinet';
    const base = (process.env.APP_URL ?? '').replace(/\/+$/, '');
    let n = 0;
    for (const [i, d] of dossiers.entries()) {
      for (let k = 0; k < (i % 2) + 1; k++) {
        const name = `[TEST] ${pick(DOCUMENT_NAMES, i + k)}`;
        const rel = `${UPLOAD_DOCS_FOLDER_NAME}/${cabinetDir}/${d.number}/Tests/${FilesUtil.sanitizeName(name)}-${c.tag}-${k + 1}.pdf`;
        const full = join(UPLOAD_PATH, rel);
        const pdf = samplePdf(`${name} — dossier ${d.number}`);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, pdf);
        c.files.push(full);
        const res = await c.m.query(
          `INSERT INTO document_customer (name, description, file_path, file_url, file_size, file_mimetype, status,
                                          dossier_id, customer_id, uploaded_by_id, version, is_current_version,
                                          uploaded_at, origin, tenant_id)
           VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?, 1, 1, NOW(), 'imported', ?)`,
          [
            name,
            'Document fictif généré pour les tests.',
            full,
            `${base}/${UPLOAD_FOLDER_NAME}/${rel}`,
            pdf.length,
            String(pick(DOCUMENT_STATUSES, i + k)),
            d.id,
            d.client_id,
            c.actorUserId,
            c.tenantId,
          ],
        );
        await this.track(c, 'documents', Number(res.insertId));
        n++;
      }
    }
    c.created.documents = n;
  }

  private async createAiDiscussions(c: Ctx, dossiers: any[]) {
    if (!c.actorUserId) {
      c.skipped.push('Discussions IA ignorées : le cabinet n’a pas d’administrateur actif.');
      return;
    }
    let n = 0;
    for (const [i, d] of dossiers.entries()) {
      if (i % 2) continue;
      const id = randomUUID();
      const [question, answer] = pick(AI_QUESTIONS, i);
      await c.m.query(
        `INSERT INTO conversations_bot (id, user_id, title, status, tenant_id, resource_type, resource_id, resource_label)
         VALUES (?, ?, ?, ?, ?, 'dossier', ?, ?)`,
        [id, String(c.actorUserId), `[TEST] ${question}`, i % 4 ? 'active' : 'archived', c.tenantId, String(d.id), d.number],
      );
      for (const [role, content] of [['user', question], ['assistant', answer]]) {
        await c.m.query(
          `INSERT INTO conversation_messages (conversation_id, conversationId, role, content, tenant_id)
           VALUES (?, ?, ?, ?, ?)`,
          [id, id, role, content, c.tenantId],
        );
      }
      await this.track(c, 'discussions_ia', id);
      n++;
    }
    c.created.discussions_ia = n;
  }

  private async createInvoices(c: Ctx, dossiers: any[]) {
    const [{ n: existing }] = await c.m.query(
      `SELECT COUNT(*) AS n FROM factures WHERE tenant_id = ? AND numero LIKE 'TEST-FAC-%'`,
      [c.tenantId],
    );
    let seq = Number(existing);
    let n = 0;
    for (const [i, d] of dossiers.entries()) {
      for (let k = 0; k < (i % 2) + 1; k++) {
        const status = pick(INVOICE_STATUSES, i + k);
        const ht = round(150000 + ((i * 3 + k) % 9) * 175000);
        const vat = 19.25;
        const tva = Math.round((ht * vat) / 100);
        const ttc = ht + tva;
        const issued = new Date(Date.now() - (45 - k * 10 - (i % 5) * 4) * day);
        // Impayée : échéance dépassée ; les autres : échéance à 30 jours.
        const due = new Date(issued.getTime() + (status === 4 ? 15 : 30) * day);
        const id = randomUUID();
        seq++;
        await c.m.query(
          `INSERT INTO factures (id, status, description, dossier_id, client_id, type, numero, libelle, date_facture,
                                 date_echeance, montant_ht, taux_tva, montant_tva, montant_ttc, currency, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(status),
            'Facture fictive générée pour les tests.',
            d.id,
            d.client_id,
            String(k ? 1 : 0),
            `TEST-FAC-${String(seq).padStart(4, '0')}`,
            `[TEST] ${k ? 'Frais de procédure' : 'Honoraires'} — ${d.number}`,
            dateOnly(issued),
            dateOnly(due),
            ht,
            vat,
            tva,
            ttc,
            c.cabinet.currency || 'XAF',
            c.tenantId,
          ],
        );
        const paid = status === 3 ? ttc : status === 2 ? round(ttc * 0.4, 1000) : 0;
        if (paid > 0) {
          const payDate = dateOnly(new Date(issued.getTime() + 10 * day));
          await c.m.query(
            `INSERT INTO paiements (id, montant, modePaiement, date_paiement, date_valeur, status, notes, facture_id,
                                    reference, tenant_id)
             VALUES (?, ?, ?, ?, ?, '1', ?, ?, ?, ?)`,
            [randomUUID(), paid, String(pick([0, 1, 2, 5], i + k)), payDate, payDate, '[TEST] Paiement fictif.', id, `TEST-PAY-${c.tag}-${seq}`, c.tenantId],
          );
        }
        await this.track(c, 'factures', id);
        n++;
      }
    }
    c.created.factures = n;
  }

  // ── Utilitaires ─────────────────────────────────────────────────────────

  private async cabinet(m: EntityManager, tenantId: number) {
    const [row] = await m.query('SELECT name, currency FROM cabinets WHERE id = ?', [tenantId]);
    if (!row) throw new NotFoundException('Cabinet introuvable.');
    return { name: row.name as string, currency: (row.currency as string) || 'XAF' };
  }

  private track(c: Ctx, entity: SampleType, id: number | string) {
    return c.m.query(
      'INSERT INTO sample_data_records (tenant_id, batch_id, entity, entity_id) VALUES (?, ?, ?, ?)',
      [c.tenantId, c.batch, entity, String(id)],
    );
  }

  private async tracked(c: Ctx, entity: SampleType, table: string): Promise<Array<{ id: number }>> {
    const rows = await c.m.query(
      `SELECT x.id FROM sample_data_records r JOIN \`${table}\` x ON x.id = r.entity_id
        WHERE r.tenant_id = ? AND r.entity = ?`,
      [c.tenantId, entity],
    );
    return rows.map((r: any) => ({ id: Number(r.id) }));
  }

  private async trackedDossiers(c: Ctx) {
    const rows = await c.m.query(
      `SELECT d.id, d.dossier_number AS number, d.client_id, d.status, d.workflow_engine AS engine, d.lifecycle_phase AS phase
         FROM sample_data_records r JOIN dossiers d ON d.id = r.entity_id
        WHERE r.tenant_id = ? AND r.entity = 'dossiers' AND d.deleted_at IS NULL`,
      [c.tenantId],
    );
    return rows.map((d: any) => ({ ...d, id: Number(d.id), status: Number(d.status) }));
  }

  /** Avocats possibles : utilisateurs de test, sinon membres actifs du cabinet. */
  private async lawyers(c: Ctx) {
    const test = await this.tracked(c, 'users', 'user');
    if (test.length) return test;
    const rows = await c.m.query(
      `SELECT e.id FROM employee e JOIN \`user\` u ON u.id = e.id
        WHERE e.tenant_id = ? AND e.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY e.id LIMIT 10`,
      [c.tenantId],
    );
    return rows.map((r: any) => ({ id: Number(r.id) }));
  }
}

function marks(ids: unknown[]) {
  return ids.map(() => '?').join(', ');
}

/** PDF minimal valide d'une page, avec un titre (ASCII uniquement). */
export function samplePdf(title: string): Buffer {
  const text = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/([()\\])/g, '\\$1');
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj 0 -30 Td /F1 12 Tf (Document de test - CabiSoft) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
