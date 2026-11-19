/**
 * Requêtes métier de l'agent IA.
 *
 * La logique du cabinet (reste à payer, factures annulées, paiements valides,
 * lignes supprimées, cabinet courant) est écrite ici une fois, en SQL
 * paramétré et testé, au lieu d'être réinventée par le modèle à chaque
 * question. Chaque requête renvoie aussi les tables lues, pour le contrôle
 * des droits de l'utilisateur.
 */

export interface AgentQuery {
  sql: string;
  params: unknown[];
  /** Tables lues (contrôle des droits avant exécution). */
  tables: string[];
}

export interface Period {
  du?: string;
  au?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Période valide (dates AAAA-MM-JJ), sinon ignorée. */
export function readPeriod(value: unknown): Period {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const du = typeof raw.du === 'string' && ISO_DATE.test(raw.du) ? raw.du : undefined;
  const au = typeof raw.au === 'string' && ISO_DATE.test(raw.au) ? raw.au : undefined;
  return { ...(du && { du }), ...(au && { au }) };
}

export function readText(value: unknown, max = 120): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim().slice(0, max);
  return text || undefined;
}

export function readLimit(value: unknown, fallback = 20, max = 50): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

/** Échappe % et _ pour un LIKE « contient ». */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Nom affiché d'un client `c`. */
export const CLIENT_NAME = `COALESCE(NULLIF(TRIM(c.company_name), ''), c.full_name)`;
/** Payé sur une facture `f` : paiements valides non supprimés. */
export const PAID = `COALESCE((SELECT SUM(p.montant) FROM paiements p
  WHERE p.facture_id = f.id AND p.status = '1' AND p.deleted_at IS NULL), 0)`;
export const REMAINING = `(f.montant_ttc - ${PAID})`;
export const INVOICE_STATUS_LABEL = `CASE f.status WHEN '0' THEN 'Brouillon' WHEN '1' THEN 'Envoyée'
  WHEN '2' THEN 'Partiellement payée' WHEN '3' THEN 'Payée' WHEN '5' THEN 'Annulée' WHEN '6' THEN 'Validée' END`;
export const DOSSIER_STATUS_LABEL = `CASE d.status WHEN 'DRAFT' THEN 'Brouillon' WHEN 'ACTIVE' THEN 'En cours'
  WHEN 'CLOSED' THEN 'Clôturé' WHEN 'ARCHIVED' THEN 'Archivé' END`;
const AUDIENCE_STATUS_LABEL = `CASE a.status WHEN '0' THEN 'Programmée' WHEN '1' THEN 'Tenue'
  WHEN '2' THEN 'Renvoyée' WHEN '3' THEN 'Annulée' WHEN '4' THEN 'En cours' END`;

/** Filtres communs « dossier » / « client » sur une requête jointe à d / c. */
function scopeFilters(args: { dossier?: string; client?: string }, where: string[], params: unknown[]) {
  if (args.dossier) {
    where.push('d.dossier_number = ?');
    params.push(args.dossier);
  }
  if (args.client) {
    where.push(`(${CLIENT_NAME} LIKE ? OR c.customer_code = ?)`);
    params.push(likePattern(args.client), args.client);
  }
}

function periodFilter(column: string, period: Period, where: string[], params: unknown[]) {
  if (period.du) {
    where.push(`${column} >= ?`);
    params.push(period.du);
  }
  if (period.au) {
    where.push(`${column} <= ?`);
    params.push(period.au);
  }
}

export type InvoiceFilter = 'toutes' | 'non_soldees' | 'en_retard';

/** Factures avec payé, reste à payer, retard et statut lisible. */
export function invoicesQuery(
  tenantId: number,
  args: { filtre?: string; dossier?: string; client?: string; retard_min_jours?: number; periode?: Period; limite?: number },
): AgentQuery {
  const where = ['f.tenant_id = ?', 'f.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  scopeFilters(args, where, params);
  periodFilter('f.date_facture', args.periode ?? {}, where, params);
  const filter = (['toutes', 'non_soldees', 'en_retard'] as const).includes(args.filtre as InvoiceFilter)
    ? (args.filtre as InvoiceFilter)
    : 'toutes';
  if (filter !== 'toutes') where.push(`f.status <> '5'`);
  const having: string[] = [];
  if (filter !== 'toutes') having.push('reste_a_payer > 0');
  if (filter === 'en_retard') {
    where.push('f.date_echeance < CURDATE() - INTERVAL ? DAY');
    params.push(Math.max(0, Math.floor(Number(args.retard_min_jours) || 0)));
  }
  return {
    // Une facture annulée ne doit rien : reste et retard à 0.
    sql: `SELECT f.numero, f.date_facture, f.date_echeance, f.montant_ht, f.montant_ttc,
        ${PAID} AS deja_paye,
        CASE WHEN f.status = '5' THEN 0 ELSE ${REMAINING} END AS reste_a_payer,
        CASE WHEN f.status = '5' OR ${REMAINING} <= 0 THEN 0
          ELSE GREATEST(DATEDIFF(CURDATE(), f.date_echeance), 0) END AS jours_retard,
        ${INVOICE_STATUS_LABEL} AS statut, d.dossier_number AS dossier, ${CLIENT_NAME} AS client
      FROM factures f
      LEFT JOIN dossiers d ON d.id = f.dossier_id
      LEFT JOIN customer c ON c.id = f.client_id
      WHERE ${where.join(' AND ')}
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
      ORDER BY ${filter === 'toutes' ? 'f.date_facture DESC' : 'reste_a_payer DESC'}
      LIMIT ${readLimit(args.limite, 30)}`,
    params,
    tables: ['factures', 'paiements', 'dossiers', 'customer'],
  };
}

/** Chiffres clés de facturation sur une période : CA HT facturé, encaissé, créances. */
export function billingFiguresQuery(tenantId: number, args: { periode?: Period; client?: string; dossier?: string }): AgentQuery {
  const period = args.periode ?? {};
  const invoiceWhere = ['f.tenant_id = ?', 'f.deleted_at IS NULL', `f.status <> '5'`];
  const invoiceParams: unknown[] = [tenantId];
  scopeFilters(args, invoiceWhere, invoiceParams);
  const billedWhere = [...invoiceWhere];
  const billedParams = [...invoiceParams];
  periodFilter('f.date_facture', period, billedWhere, billedParams);
  const paidWhere = [...invoiceWhere, `p.status = '1'`, 'p.deleted_at IS NULL'];
  const paidParams = [...invoiceParams];
  periodFilter('p.date_paiement', period, paidWhere, paidParams);
  const join = `FROM factures f LEFT JOIN dossiers d ON d.id = f.dossier_id LEFT JOIN customer c ON c.id = f.client_id`;
  return {
    sql: `SELECT
        (SELECT COALESCE(SUM(f.montant_ht), 0) ${join} WHERE ${billedWhere.join(' AND ')}) AS ca_facture_ht,
        (SELECT COALESCE(SUM(f.montant_ttc), 0) ${join} WHERE ${billedWhere.join(' AND ')}) AS ca_facture_ttc,
        (SELECT COUNT(*) ${join} WHERE ${billedWhere.join(' AND ')}) AS nombre_factures,
        (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p JOIN factures f ON f.id = p.facture_id
           LEFT JOIN dossiers d ON d.id = f.dossier_id LEFT JOIN customer c ON c.id = f.client_id
           WHERE ${paidWhere.join(' AND ')}) AS encaisse,
        (SELECT COALESCE(SUM(t.reste), 0) FROM (SELECT ${REMAINING} AS reste ${join}
           WHERE ${invoiceWhere.join(' AND ')}) t WHERE t.reste > 0) AS creances_a_ce_jour`,
    params: [...billedParams, ...billedParams, ...billedParams, ...paidParams, ...invoiceParams],
    tables: ['factures', 'paiements', 'dossiers', 'customer'],
  };
}

/** Clients classés par reste à payer. */
export function debtorsQuery(tenantId: number, args: { limite?: number }): AgentQuery {
  return {
    sql: `SELECT ${CLIENT_NAME} AS client, c.customer_code AS code_client,
        SUM(t.reste) AS reste_a_payer, COUNT(*) AS factures_non_soldees
      FROM (SELECT f.client_id, ${REMAINING} AS reste FROM factures f
            WHERE f.tenant_id = ? AND f.deleted_at IS NULL AND f.status <> '5') t
      JOIN customer c ON c.id = t.client_id
      WHERE t.reste > 0
      GROUP BY c.id, client, code_client
      ORDER BY reste_a_payer DESC
      LIMIT ${readLimit(args.limite, 10)}`,
    params: [tenantId],
    tables: ['factures', 'paiements', 'customer'],
  };
}

/** Paiements valides reçus. */
export function paymentsQuery(tenantId: number, args: { client?: string; dossier?: string; periode?: Period; limite?: number }): AgentQuery {
  const where = ['p.tenant_id = ?', `p.status = '1'`, 'p.deleted_at IS NULL', 'f.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  scopeFilters(args, where, params);
  periodFilter('p.date_paiement', args.periode ?? {}, where, params);
  return {
    sql: `SELECT p.date_paiement, p.montant, p.reference, f.numero AS facture, d.dossier_number AS dossier, ${CLIENT_NAME} AS client
      FROM paiements p JOIN factures f ON f.id = p.facture_id
      LEFT JOIN dossiers d ON d.id = f.dossier_id LEFT JOIN customer c ON c.id = f.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.date_paiement DESC LIMIT ${readLimit(args.limite, 30)}`,
    params,
    tables: ['paiements', 'factures', 'dossiers', 'customer'],
  };
}

/** Dossiers (hors confidentiels pour qui n'a pas le droit : filtré par l'appelant). */
export function dossiersQuery(
  tenantId: number,
  args: { statut?: string; client?: string; texte?: string; limite?: number },
  includeConfidential: boolean,
): AgentQuery {
  const where = ['d.tenant_id = ?', 'd.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  if (!includeConfidential) where.push('d.confidentiality_level = 0');
  const status = String(args.statut ?? '').toUpperCase();
  if (['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED'].includes(status)) {
    where.push('d.status = ?');
    params.push(status);
  }
  scopeFilters({ client: args.client }, where, params);
  if (args.texte) {
    where.push('(d.dossier_number LIKE ? OR d.object LIKE ? OR d.case_number LIKE ? OR d.opposing_party_name LIKE ?)');
    const pattern = likePattern(args.texte);
    params.push(pattern, pattern, pattern, pattern);
  }
  return {
    sql: `SELECT d.dossier_number, LEFT(d.object, 160) AS objet, ${DOSSIER_STATUS_LABEL} AS statut,
        ${CLIENT_NAME} AS client, d.opening_date AS ouverture, d.closing_date AS cloture,
        d.opposing_party_name AS partie_adverse,
        COUNT(*) OVER () AS total_correspondant
      FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.id DESC LIMIT ${readLimit(args.limite, 30)}`,
    params,
    tables: ['dossiers', 'customer'],
  };
}

export function audiencesQuery(
  tenantId: number,
  args: { quand?: string; dossier?: string; periode?: Period; limite?: number },
): AgentQuery {
  const where = ['a.tenant_id = ?', 'a.deleted_at IS NULL', 'd.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  scopeFilters({ dossier: args.dossier }, where, params);
  const when = args.quand === 'passees' || args.quand === 'toutes' ? args.quand : 'a_venir';
  if (when === 'a_venir') where.push(`a.audience_date >= CURDATE() AND a.status IN ('0', '4')`);
  if (when === 'passees') where.push('a.audience_date < CURDATE()');
  periodFilter('a.audience_date', args.periode ?? {}, where, params);
  return {
    sql: `SELECT a.audience_date AS date, a.audience_time AS heure, ${AUDIENCE_STATUS_LABEL} AS statut,
        d.dossier_number AS dossier, ${CLIENT_NAME} AS client, j.name AS juridiction, a.room AS salle,
        a.postponed_to AS renvoyee_au, LEFT(a.decision, 200) AS decision
      FROM audiences a JOIN dossiers d ON d.id = a.dossier_id
      LEFT JOIN customer c ON c.id = d.client_id
      LEFT JOIN jurisdictions j ON j.id = a.jurisdiction_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.audience_date ${when === 'passees' ? 'DESC' : 'ASC'}, a.id
      LIMIT ${readLimit(args.limite, 20)}`,
    params,
    tables: ['audiences', 'dossiers', 'customer', 'jurisdictions'],
  };
}

export function actionsQuery(
  tenantId: number,
  args: { etat?: string; dossier?: string; limite?: number; jours?: number },
  includeConfidential: boolean,
): AgentQuery {
  const where = ['a.tenant_id = ?', 'a.deleted_at IS NULL', 'd.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  if (!includeConfidential) where.push('d.confidentiality_level = 0');
  scopeFilters({ dossier: args.dossier }, where, params);
  const state = ['ouvertes', 'en_retard', 'a_echeance', 'terminees', 'toutes'].includes(String(args.etat)) ? args.etat : 'ouvertes';
  if (state === 'ouvertes' || state === 'en_retard' || state === 'a_echeance') where.push(`a.status IN ('TODO', 'IN_PROGRESS', 'ON_HOLD')`);
  if (state === 'en_retard') where.push('a.due_at < NOW()');
  if (state === 'a_echeance') {
    // Échéance dans les prochains jours (pas encore dépassée).
    where.push('a.due_at >= NOW() AND a.due_at < NOW() + INTERVAL ? DAY');
    params.push(Math.min(Math.max(Math.trunc(Number(args.jours) || 7), 1), 31));
  }
  if (state === 'terminees') where.push(`a.status = 'COMPLETED'`);
  return {
    sql: `SELECT a.title AS action, CASE a.status WHEN 'TODO' THEN 'À faire' WHEN 'IN_PROGRESS' THEN 'En cours'
          WHEN 'ON_HOLD' THEN 'En attente' WHEN 'COMPLETED' THEN 'Terminée' WHEN 'CANCELLED' THEN 'Annulée' END AS statut,
        a.due_at AS echeance, a.completed_at AS terminee_le, d.dossier_number AS dossier,
        CONCAT(u.first_name, ' ', u.last_name) AS responsable
      FROM dossier_actions a JOIN dossiers d ON d.id = a.dossier_id
      LEFT JOIN user u ON u.id = a.responsible_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${state === 'terminees' ? 'a.completed_at DESC' : 'a.due_at IS NULL, a.due_at'}
      LIMIT ${readLimit(args.limite, 30)}`,
    params,
    // `user` est protégée pour le SQL libre (mots de passe, jetons). Cette
    // requête fixe n'en lit que le prénom et le nom du responsable : elle
    // n'est pas soumise à ce refus. Ne pas y ajouter d'autre colonne de `user`.
    tables: ['dossier_actions', 'dossiers'],
  };
}

export function billableItemsQuery(tenantId: number, args: { dossier?: string; etat?: string; limite?: number }): AgentQuery {
  const where = ['bi.tenant_id = ?', 'bi.deleted_at IS NULL', 'd.deleted_at IS NULL'];
  const params: unknown[] = [tenantId];
  scopeFilters({ dossier: args.dossier }, where, params);
  const state = args.etat === 'a_verifier' ? 'NEEDS_REVIEW' : args.etat === 'tous' ? null : 'TO_INVOICE';
  if (state) {
    where.push('bi.status = ?');
    params.push(state);
  }
  return {
    sql: `SELECT bi.label AS element, bi.status AS etat, bi.quantity AS quantite, bi.unit_label AS unite,
        bi.unit_price AS prix_unitaire, bi.net_amount AS montant_ht, bi.gross_amount AS montant_ttc, bi.currency AS devise,
        bi.review_reason AS motif_verification, bi.occurred_at AS date, d.dossier_number AS dossier
      FROM billable_items bi JOIN dossiers d ON d.id = bi.dossier_id
      WHERE ${where.join(' AND ')}
      ORDER BY bi.occurred_at DESC LIMIT ${readLimit(args.limite, 30)}`,
    params,
    tables: ['billable_items', 'dossiers'],
  };
}

/** Identité d'un dossier (pour sa synthèse). */
export function dossierIdentityQuery(tenantId: number, dossierNumber: string, includeConfidential: boolean): AgentQuery {
  return {
    sql: `SELECT d.dossier_number, LEFT(d.object, 400) AS objet, ${DOSSIER_STATUS_LABEL} AS statut,
        CASE d.lifecycle_phase WHEN 'OPENING' THEN 'Ouverture' WHEN 'TREATMENT' THEN 'Traitement' WHEN 'CLOSED' THEN 'Clôture' END AS phase,
        CASE d.outcome WHEN 'won' THEN 'Gagné' WHEN 'lost' THEN 'Perdu' WHEN 'settled' THEN 'Transigé'
          WHEN 'abandoned' THEN 'Abandonné' ELSE NULL END AS issue,
        ${CLIENT_NAME} AS client, c.customer_code AS code_client, COALESCE(j.name, d.court_name) AS juridiction,
        d.case_number AS numero_rg, d.opposing_party_name AS partie_adverse, d.opening_date AS ouverture, d.closing_date AS cloture
      FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id LEFT JOIN jurisdictions j ON j.id = d.jurisdiction_id
      WHERE d.tenant_id = ? AND d.deleted_at IS NULL ${includeConfidential ? '' : 'AND d.confidentiality_level = 0'}
        AND (d.dossier_number = ? OR d.case_number = ?)
      LIMIT 1`,
    params: [tenantId, dossierNumber, dossierNumber],
    tables: ['dossiers', 'customer', 'jurisdictions'],
  };
}

/** Recherche d'un nom ou d'un numéro dans les dossiers, clients et factures. */
export function searchQueries(tenantId: number, text: string, includeConfidential: boolean): Record<string, AgentQuery> {
  const pattern = likePattern(text);
  return {
    dossiers: {
      sql: `SELECT d.dossier_number, LEFT(d.object, 120) AS objet, ${CLIENT_NAME} AS client, ${DOSSIER_STATUS_LABEL} AS statut
        FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id
        WHERE d.tenant_id = ? AND d.deleted_at IS NULL ${includeConfidential ? '' : 'AND d.confidentiality_level = 0'}
          AND (d.dossier_number LIKE ? OR d.object LIKE ? OR d.case_number LIKE ? OR d.opposing_party_name LIKE ? OR ${CLIENT_NAME} LIKE ?)
        ORDER BY d.id DESC LIMIT 8`,
      params: [tenantId, pattern, pattern, pattern, pattern, pattern],
      tables: ['dossiers', 'customer'],
    },
    clients: {
      sql: `SELECT ${CLIENT_NAME} AS client, c.customer_code AS code_client, c.email, c.number_phone_1 AS telephone
        FROM customer c
        WHERE c.tenant_id = ? AND c.deleted_at IS NULL
          AND (c.full_name LIKE ? OR c.company_name LIKE ? OR c.customer_code LIKE ? OR c.email LIKE ?)
        ORDER BY c.id DESC LIMIT 8`,
      params: [tenantId, pattern, pattern, pattern, pattern],
      tables: ['customer'],
    },
    factures: {
      sql: `SELECT f.numero, f.date_facture, f.montant_ttc, ${INVOICE_STATUS_LABEL} AS statut
        FROM factures f WHERE f.tenant_id = ? AND f.deleted_at IS NULL AND f.numero LIKE ?
        ORDER BY f.date_facture DESC LIMIT 8`,
      params: [tenantId, pattern],
      tables: ['factures'],
    },
  };
}

/**
 * @mention ou fiche ouverte (identifiant technique) → numéro métier et
 * compléments, pour que l'agent puisse appeler ses outils.
 */
export function referenceByIdQuery(
  tenantId: number,
  type: 'dossier' | 'client' | 'facture' | 'audience',
  id: number | string,
  includeConfidential: boolean,
): AgentQuery {
  const confidential = includeConfidential ? '' : 'AND d.confidentiality_level = 0';
  switch (type) {
    case 'dossier':
      return {
        sql: `SELECT d.dossier_number AS reference, ${CLIENT_NAME} AS client, LEFT(d.object, 120) AS objet
          FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id
          WHERE d.tenant_id = ? AND d.deleted_at IS NULL ${confidential} AND d.id = ? LIMIT 1`,
        params: [tenantId, id],
        tables: ['dossiers', 'customer'],
      };
    case 'facture':
      return {
        sql: `SELECT f.numero AS reference, d.dossier_number AS dossier, ${CLIENT_NAME} AS client
          FROM factures f LEFT JOIN dossiers d ON d.id = f.dossier_id LEFT JOIN customer c ON c.id = f.client_id
          WHERE f.tenant_id = ? AND f.deleted_at IS NULL AND f.id = ? LIMIT 1`,
        params: [tenantId, id],
        tables: ['factures', 'dossiers', 'customer'],
      };
    case 'client':
      return {
        sql: `SELECT ${CLIENT_NAME} AS reference, c.customer_code AS code FROM customer c
          WHERE c.tenant_id = ? AND c.deleted_at IS NULL AND c.id = ? LIMIT 1`,
        params: [tenantId, id],
        tables: ['customer'],
      };
    default:
      return {
        sql: `SELECT CONCAT('du ', a.audience_date) AS reference, d.dossier_number AS dossier, ${CLIENT_NAME} AS client
          FROM audiences a JOIN dossiers d ON d.id = a.dossier_id LEFT JOIN customer c ON c.id = d.client_id
          WHERE a.tenant_id = ? AND a.deleted_at IS NULL ${confidential} AND a.id = ? LIMIT 1`,
        params: [tenantId, id],
        tables: ['audiences', 'dossiers', 'customer'],
      };
  }
}

/** Résolution d'une référence (numéro ou nom) en identifiant, pour une fiche. */
export function resolveReferenceQuery(
  tenantId: number,
  type: 'dossier' | 'client' | 'facture' | 'audience',
  reference: string,
  includeConfidential: boolean,
): AgentQuery {
  switch (type) {
    case 'dossier':
      return {
        sql: `SELECT d.id, d.dossier_number AS label FROM dossiers d
          WHERE d.tenant_id = ? AND d.deleted_at IS NULL ${includeConfidential ? '' : 'AND d.confidentiality_level = 0'}
            AND (d.dossier_number = ? OR d.case_number = ?) LIMIT 2`,
        params: [tenantId, reference, reference],
        tables: ['dossiers'],
      };
    case 'facture':
      return {
        sql: `SELECT f.id, f.numero AS label FROM factures f WHERE f.tenant_id = ? AND f.deleted_at IS NULL AND f.numero = ? LIMIT 2`,
        params: [tenantId, reference],
        tables: ['factures'],
      };
    case 'client':
      return {
        sql: `SELECT c.id, ${CLIENT_NAME} AS label FROM customer c
          WHERE c.tenant_id = ? AND c.deleted_at IS NULL
            AND (c.customer_code = ? OR ${CLIENT_NAME} = ? OR c.full_name LIKE ? OR c.company_name LIKE ?)
          ORDER BY (c.customer_code = ? OR ${CLIENT_NAME} = ?) DESC LIMIT 5`,
        params: [tenantId, reference, reference, likePattern(reference), likePattern(reference), reference, reference],
        tables: ['customer'],
      };
    default:
      return {
        sql: `SELECT a.id, CONCAT('Audience du ', a.audience_date) AS label FROM audiences a
          WHERE a.tenant_id = ? AND a.deleted_at IS NULL AND a.id = ? LIMIT 1`,
        params: [tenantId, Number(reference) || 0],
        tables: ['audiences'],
      };
  }
}
