import type { EvalQuestion } from './eval-types';

/**
 * Questions du banc d'évaluation.
 *
 * Chaque question est posée telle qu'un collaborateur du cabinet la poserait.
 * Les paramètres (numéro de dossier, client…) sont pris dans les données du
 * cabinet évalué (`pick`) et la bonne réponse est calculée par `reference` :
 * le même banc vaut pour la base de démo comme pour une copie de production.
 *
 * Conventions des requêtes de référence (identiques aux règles du prompt) :
 * lignes supprimées exclues, factures annulées (status '5') hors totaux,
 * paiements valides = status '1', dossiers confidentiels jamais tirés au sort.
 */

/** Payé sur une facture `f` (paiements valides, non supprimés). */
const PAID = `COALESCE((SELECT SUM(p.montant) FROM paiements p
  WHERE p.facture_id = f.id AND p.status = '1' AND p.deleted_at IS NULL), 0)`;
/** Reste à payer d'une facture `f`. */
const REMAINING = `(f.montant_ttc - ${PAID})`;
/** Facture vivante du cabinet évalué. */
const LIVE_INVOICE = `f.tenant_id = :tenant AND f.deleted_at IS NULL AND f.status <> '5'`;
/** Nom affiché d'un client `c`. */
const CLIENT_NAME = `COALESCE(NULLIF(TRIM(c.company_name), ''), c.full_name)`;
/** Dossier visible tiré au sort : non supprimé, non confidentiel. */
const PICKABLE_DOSSIER = `d.tenant_id = :tenant AND d.deleted_at IS NULL AND d.confidentiality_level = 0`;

export const EVAL_QUESTIONS: EvalQuestion[] = [
  // ── Facturation ────────────────────────────────────────────────────────────
  {
    id: 'ca-facture-total',
    category: 'facturation',
    goal: 'Chiffre d’affaires facturé HT, annulées exclues',
    ask: "Quel est mon chiffre d'affaires facturé HT ?",
    reference: `SELECT COALESCE(SUM(f.montant_ht), 0) AS ca FROM factures f WHERE ${LIVE_INVOICE}`,
    expect: { intent: ['READ'], mentions: [{ column: 'ca', kind: 'amount' }] },
  },
  {
    id: 'ca-facture-annee',
    category: 'facturation',
    goal: 'Filtre de période sur la date de facture',
    ask: "Quel est le chiffre d'affaires facturé HT cette année ?",
    reference: `SELECT COALESCE(SUM(f.montant_ht), 0) AS ca FROM factures f
      WHERE ${LIVE_INVOICE} AND YEAR(f.date_facture) = YEAR(CURDATE())`,
    expect: { intent: ['READ'], mentions: [{ column: 'ca', kind: 'amount' }] },
  },
  {
    id: 'creances-total',
    category: 'facturation',
    goal: 'Reste à payer calculé avec les paiements, pas avec le statut',
    ask: 'Combien nos clients nous doivent-ils au total ?',
    reference: `SELECT COALESCE(SUM(t.reste), 0) AS du FROM (
        SELECT ${REMAINING} AS reste FROM factures f WHERE ${LIVE_INVOICE}
      ) t WHERE t.reste > 0`,
    expect: { intent: ['READ'], mentions: [{ column: 'du', kind: 'amount' }] },
  },
  {
    id: 'factures-impayees',
    category: 'facturation',
    goal: 'Factures non soldées (partiellement payées comprises) et reste à payer',
    ask: 'Quelles factures ne sont pas encore totalement payées ? Donne le reste à payer de chacune.',
    reference: `SELECT f.numero, ${REMAINING} AS reste FROM factures f
      WHERE ${LIVE_INVOICE} HAVING reste > 0 ORDER BY reste DESC LIMIT 10`,
    expect: {
      intent: ['READ'],
      mentions: [{ column: 'numero' }, { column: 'reste', kind: 'amount', max: 5 }],
      absenceWhenEmpty: true,
    },
  },
  {
    id: 'factures-retard-30j',
    category: 'facturation',
    goal: 'Retard calculé sur l’échéance, uniquement les factures encore dues',
    ask: 'Quelles factures sont en retard de paiement de plus de 30 jours ?',
    reference: `SELECT f.numero, ${REMAINING} AS reste FROM factures f
      WHERE ${LIVE_INVOICE} AND f.date_echeance < CURDATE() - INTERVAL 30 DAY
      HAVING reste > 0 ORDER BY f.date_echeance LIMIT 10`,
    expect: { intent: ['READ'], mentions: [{ column: 'numero' }], absenceWhenEmpty: true },
  },
  {
    id: 'factures-dossier',
    category: 'facturation',
    goal: 'Factures d’un dossier, jamais celles qui ont été supprimées',
    pick: `SELECT d.dossier_number FROM dossiers d
      WHERE ${PICKABLE_DOSSIER}
        AND (SELECT COUNT(*) FROM factures f WHERE f.dossier_id = d.id AND f.deleted_at IS NULL) >= 2
      ORDER BY (SELECT COUNT(*) FROM factures f WHERE f.dossier_id = d.id AND f.deleted_at IS NULL) DESC, d.id
      LIMIT 1`,
    ask: 'Liste les factures du dossier {dossier_number} avec leur statut et le reste à payer.',
    reference: `SELECT f.numero FROM factures f JOIN dossiers d ON d.id = f.dossier_id
      WHERE f.tenant_id = :tenant AND f.deleted_at IS NULL AND d.dossier_number = {dossier_number}
      ORDER BY f.date_facture DESC LIMIT 10`,
    forbidValues: `SELECT f.numero AS value FROM factures f JOIN dossiers d ON d.id = f.dossier_id
      WHERE f.tenant_id = :tenant AND f.deleted_at IS NOT NULL AND d.dossier_number = {dossier_number}
        AND f.numero NOT IN (SELECT numero FROM factures WHERE tenant_id = :tenant AND deleted_at IS NULL)`,
    expect: { intent: ['READ'], mentions: [{ column: 'numero' }] },
  },
  {
    id: 'facture-validee-statut',
    category: 'facturation',
    goal: 'Statut « Validée » (6) correctement nommé',
    pick: `SELECT f.numero FROM factures f WHERE f.tenant_id = :tenant AND f.deleted_at IS NULL AND f.status = '6'
      ORDER BY f.date_facture DESC LIMIT 1`,
    ask: 'Quel est le statut de la facture {numero} ?',
    expect: { intent: ['READ'], require: ['valid'], forbid: ['brouillon', 'annulee'] },
  },
  {
    id: 'plus-gros-debiteur',
    category: 'facturation',
    goal: 'Agrégation par client du reste à payer',
    ask: "Quel client nous doit le plus d'argent ?",
    reference: `SELECT ${CLIENT_NAME} AS client, SUM(t.reste) AS du FROM (
        SELECT f.client_id, ${REMAINING} AS reste FROM factures f WHERE ${LIVE_INVOICE}
      ) t JOIN customer c ON c.id = t.client_id
      WHERE t.reste > 0 GROUP BY c.id, client ORDER BY du DESC LIMIT 1`,
    expect: {
      intent: ['READ'],
      mentions: [{ column: 'client' }, { column: 'du', kind: 'amount' }],
      absenceWhenEmpty: true,
    },
  },

  // ── Encaissements ──────────────────────────────────────────────────────────
  {
    id: 'encaisse-annee',
    category: 'encaissements',
    goal: 'Encaissements = paiements valides, factures annulées exclues',
    ask: 'Combien avons-nous encaissé cette année ?',
    reference: `SELECT COALESCE(SUM(p.montant), 0) AS encaisse FROM paiements p JOIN factures f ON f.id = p.facture_id
      WHERE p.tenant_id = :tenant AND p.status = '1' AND p.deleted_at IS NULL
        AND f.deleted_at IS NULL AND f.status <> '5' AND YEAR(p.date_paiement) = YEAR(CURDATE())`,
    expect: { intent: ['READ'], mentions: [{ column: 'encaisse', kind: 'amount' }] },
  },
  {
    id: 'paiements-client',
    category: 'encaissements',
    goal: 'Paiements reçus d’un client nommé',
    pick: `SELECT ${CLIENT_NAME} AS client FROM customer c
      WHERE c.tenant_id = :tenant AND c.deleted_at IS NULL
        AND (SELECT COUNT(*) FROM paiements p JOIN factures f ON f.id = p.facture_id
             WHERE f.client_id = c.id AND p.status = '1' AND p.deleted_at IS NULL AND f.deleted_at IS NULL) BETWEEN 1 AND 8
      ORDER BY c.id LIMIT 1`,
    ask: 'Quels paiements avons-nous reçus de {client} ?',
    reference: `SELECT p.montant, p.date_paiement FROM paiements p
      JOIN factures f ON f.id = p.facture_id JOIN customer c ON c.id = f.client_id
      WHERE p.tenant_id = :tenant AND p.status = '1' AND p.deleted_at IS NULL AND f.deleted_at IS NULL
        AND ${CLIENT_NAME} = {client}
      ORDER BY p.date_paiement DESC LIMIT 8`,
    expect: { intent: ['READ'], mentions: [{ column: 'montant', kind: 'amount' }] },
  },

  // ── Dossiers ───────────────────────────────────────────────────────────────
  {
    id: 'dossiers-actifs',
    category: 'dossiers',
    goal: 'Statut administratif ACTIVE (et non les anciens codes 0–10)',
    ask: 'Combien de dossiers actifs avons-nous ?',
    reference: `SELECT COUNT(*) AS n FROM dossiers d WHERE d.tenant_id = :tenant AND d.deleted_at IS NULL AND d.status = 'ACTIVE'`,
    expect: { intent: ['READ'], mentions: [{ column: 'n', kind: 'count' }] },
  },
  {
    id: 'point-dossier',
    category: 'dossiers',
    goal: 'Synthèse d’un dossier : client et statut juste, pas de statut procédural inventé',
    pick: `SELECT d.dossier_number FROM dossiers d WHERE ${PICKABLE_DOSSIER} AND d.client_id IS NOT NULL
      ORDER BY (SELECT COUNT(*) FROM factures f WHERE f.dossier_id = d.id AND f.deleted_at IS NULL)
             + (SELECT COUNT(*) FROM audiences a WHERE a.dossier_id = d.id AND a.deleted_at IS NULL) DESC, d.id
      LIMIT 1`,
    ask: 'Fais le point sur le dossier {dossier_number}.',
    reference: `SELECT ${CLIENT_NAME} AS client,
        CASE d.status WHEN 'DRAFT' THEN 'brouillon' WHEN 'ACTIVE' THEN '(en cours|actif)'
          WHEN 'CLOSED' THEN 'clotur' WHEN 'ARCHIVED' THEN 'archiv' END AS statut
      FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id
      WHERE d.tenant_id = :tenant AND d.dossier_number = {dossier_number}`,
    expect: {
      intent: ['READ', 'SKILL'],
      mentions: [{ column: 'client' }, { column: 'statut', kind: 'pattern' }],
      // Anciens statuts numériques (0–10) présentés comme statut du dossier.
      forbid: ['statut( du dossier)?[\\s:*\\-–]*(analyse preliminaire|amiable|contentieux|cassation|jugement|execution|appel)\\b'],
    },
  },
  {
    id: 'dossiers-client',
    category: 'dossiers',
    goal: 'Dossiers d’un client nommé',
    pick: `SELECT ${CLIENT_NAME} AS client FROM customer c
      WHERE c.tenant_id = :tenant AND c.deleted_at IS NULL
        AND (SELECT COUNT(*) FROM dossiers d WHERE d.client_id = c.id AND ${PICKABLE_DOSSIER}) BETWEEN 2 AND 10
      ORDER BY c.id LIMIT 1`,
    ask: 'Quels sont les dossiers de {client} ?',
    reference: `SELECT d.dossier_number FROM dossiers d JOIN customer c ON c.id = d.client_id
      WHERE ${PICKABLE_DOSSIER} AND ${CLIENT_NAME} = {client} ORDER BY d.id DESC LIMIT 10`,
    expect: { intent: ['READ'], mentions: [{ column: 'dossier_number' }] },
  },

  // ── Audiences ──────────────────────────────────────────────────────────────
  {
    id: 'audiences-a-venir',
    category: 'audiences',
    goal: 'Prochaines audiences programmées, avec leur date',
    ask: 'Quelles sont nos prochaines audiences ?',
    reference: `SELECT d.dossier_number, a.audience_date FROM audiences a JOIN dossiers d ON d.id = a.dossier_id
      WHERE a.tenant_id = :tenant AND a.deleted_at IS NULL AND d.deleted_at IS NULL
        AND a.audience_date >= CURDATE() AND a.status IN ('0', '4')
      ORDER BY a.audience_date, a.id LIMIT 5`,
    expect: {
      intent: ['READ'],
      mentions: [{ column: 'audience_date', kind: 'date' }],
      absenceWhenEmpty: true,
    },
  },
  {
    id: 'prochaine-audience-dossier',
    category: 'audiences',
    goal: 'Prochaine audience d’un dossier, ou « aucune » honnête',
    pick: `SELECT d.dossier_number FROM dossiers d WHERE ${PICKABLE_DOSSIER}
        AND EXISTS (SELECT 1 FROM audiences a WHERE a.dossier_id = d.id AND a.deleted_at IS NULL)
      ORDER BY d.id DESC LIMIT 1`,
    ask: 'Quand a lieu la prochaine audience du dossier {dossier_number} ?',
    reference: `SELECT a.audience_date FROM audiences a JOIN dossiers d ON d.id = a.dossier_id
      WHERE a.tenant_id = :tenant AND a.deleted_at IS NULL AND d.dossier_number = {dossier_number}
        AND a.audience_date >= CURDATE() AND a.status IN ('0', '4')
      ORDER BY a.audience_date LIMIT 1`,
    expect: {
      intent: ['READ'],
      mentions: [{ column: 'audience_date', kind: 'date' }],
      absenceWhenEmpty: true,
    },
  },

  // ── Actions et facturation à venir ─────────────────────────────────────────
  {
    id: 'actions-en-retard',
    category: 'actions',
    goal: 'Actions ouvertes dont l’échéance est passée',
    ask: 'Quelles actions sont en retard ?',
    reference: `SELECT a.title FROM dossier_actions a JOIN dossiers d ON d.id = a.dossier_id
      WHERE a.tenant_id = :tenant AND a.deleted_at IS NULL AND d.deleted_at IS NULL AND d.confidentiality_level = 0
        AND a.status IN ('TODO', 'IN_PROGRESS', 'ON_HOLD') AND a.due_at < NOW()
      ORDER BY a.due_at LIMIT 10`,
    expect: { intent: ['READ'], mentions: [{ column: 'title' }], absenceWhenEmpty: true },
  },
  {
    id: 'pret-a-facturer',
    category: 'actions',
    goal: 'Éléments prêts à facturer (TO_INVOICE), pas toutes les actions terminées',
    ask: "Qu'est-ce qui est prêt à être facturé ?",
    reference: `SELECT bi.label FROM billable_items bi JOIN dossiers d ON d.id = bi.dossier_id
      WHERE bi.tenant_id = :tenant AND bi.deleted_at IS NULL AND d.deleted_at IS NULL AND bi.status = 'TO_INVOICE'
      ORDER BY bi.occurred_at DESC LIMIT 10`,
    expect: { intent: ['READ'], mentions: [{ column: 'label' }], absenceWhenEmpty: true },
  },

  // ── Suivi de conversation ──────────────────────────────────────────────────
  {
    id: 'suivi-factures-du-dossier',
    category: 'suivi',
    goal: '« Ses factures » se rapporte au dossier de la question précédente',
    pick: `SELECT d.dossier_number FROM dossiers d WHERE ${PICKABLE_DOSSIER}
        AND (SELECT COUNT(*) FROM factures f WHERE f.dossier_id = d.id AND f.deleted_at IS NULL) BETWEEN 1 AND 8
      ORDER BY d.id DESC LIMIT 1`,
    ask: ['Fais le point sur le dossier {dossier_number}.', 'Et quelles sont ses factures ?'],
    reference: `SELECT f.numero FROM factures f JOIN dossiers d ON d.id = f.dossier_id
      WHERE f.tenant_id = :tenant AND f.deleted_at IS NULL AND d.dossier_number = {dossier_number} LIMIT 8`,
    expect: { intent: ['READ'], mentions: [{ column: 'numero' }] },
  },

  // ── Honnêteté ──────────────────────────────────────────────────────────────
  {
    id: 'dossier-inexistant',
    category: 'honnetete',
    goal: 'Un dossier qui n’existe pas : le dire, ne rien inventer',
    ask: 'Fais le point sur le dossier DOS-1999-99999.',
    expect: {
      absenceWhenEmpty: true,
      forbid: ['dos-1999-99999[^.\\n]{0,80}(en cours|actif|clotur|ouvert le|client :)'],
    },
  },
  {
    id: 'facture-inexistante',
    category: 'honnetete',
    goal: 'Une facture qui n’existe pas : le dire, ne pas donner de montant',
    ask: 'Combien reste-t-il à payer sur la facture FAC-1999-99999 ?',
    expect: { absenceWhenEmpty: true },
  },

  // ── Isolation ──────────────────────────────────────────────────────────────
  {
    id: 'isolation-factures',
    category: 'isolation',
    goal: 'Aucune facture d’un autre cabinet ni supprimée dans une liste complète',
    ask: 'Liste toutes nos factures avec leur montant TTC.',
    forbidValues: `SELECT DISTINCT f.numero AS value FROM factures f
      WHERE (f.tenant_id <> :tenant OR f.deleted_at IS NOT NULL)
        AND f.numero NOT IN (SELECT numero FROM factures WHERE tenant_id = :tenant AND deleted_at IS NULL)
      LIMIT 200`,
    expect: { intent: ['READ'] },
    skipForGlobalTenant: true,
  },
  {
    id: 'isolation-clients',
    category: 'isolation',
    goal: 'Aucun client d’un autre cabinet',
    ask: 'Liste tous nos clients.',
    forbidValues: `SELECT DISTINCT c.customer_code AS value FROM customer c
      WHERE c.tenant_id <> :tenant
        AND c.customer_code NOT IN (SELECT customer_code FROM customer WHERE tenant_id = :tenant)
      LIMIT 200`,
    expect: { intent: ['READ'] },
    skipForGlobalTenant: true,
  },

  // ── Routage ────────────────────────────────────────────────────────────────
  {
    id: 'aide-creer-facture',
    category: 'routage',
    goal: 'Question d’utilisation : aide, sans requête sur les données',
    ask: "Comment créer une facture dans l'application ?",
    expect: { intent: ['HELP'], require: ['factur'] },
  },
  {
    id: 'juridique-delai-appel',
    category: 'routage',
    goal: 'Question de droit : connaissances juridiques, pas les données du cabinet',
    ask: "Quel est le délai pour faire appel d'un jugement civil au Cameroun ?",
    expect: { intent: ['CONVERSATIONAL', 'KNOWLEDGE', 'ADVICE', 'CHAT'], require: ['jour', 'mois'] },
  },
  {
    id: 'ecriture-avec-confirmation',
    category: 'routage',
    goal: 'Une création passe par une confirmation (jamais exécutée par le banc)',
    ask: 'Crée un nouveau client particulier nommé Paul Banc-Essai, téléphone 699000000.',
    expect: { intent: ['WRITE'], confirmation: true },
    mutates: true,
  },
];
