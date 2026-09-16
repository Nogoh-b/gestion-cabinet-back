import { AiDatabaseProjectConfig } from 'src/core/ai-database/interfaces/ai-database-project-config.interface';

/**
 * Mots-clés du domaine métier (sans accents, minuscules).
 * Le classificateur d'intention les utilise pour distinguer les questions
 * portant sur les données du cabinet (READ/WRITE) des questions générales (CHAT).
 */
export const DOMAIN_KEYWORDS: AiDatabaseProjectConfig['domainKeywords'] = [
  // Entités principales
  'dossier', 'dossiers', 'client', 'clients', 'customer',
  'audience', 'audiences', 'facture', 'factures', 'facturable', 'facturables', 'facturer',
  'paiement', 'paiements', 'document', 'documents',
  'avocat', 'avocats', 'employee', 'employe', 'employes',
  'diligence', 'diligences',
  // Comptabilité
  'ecriture', 'ecritures', 'compte', 'comptes',
  'journal', 'journaux', 'exercice', 'exercices',
  'salaire', 'salaires',
  // Traitement orienté actions
  'traitement', 'action', 'actions', 'sous-action', 'sous-actions',
  'recommandation', 'recommandations', 'priorite', 'rappel',
  'etape', 'etapes', 'prochaine action',
  // Termes financiers
  'chiffre', 'montant', 'encaisse', 'encaisser', 'encaissement',
  'impaye', 'impayes', 'impayee', 'impayees',
  'paye', 'payee', 'payer', 'payees',
  'solde', 'soldee', 'solder', 'soldees',
  'regle', 'reglee', 'regler', 'reglees', 'reglement',
  'honoraire', 'honoraires',
  'du', 'due', 'dues',
  'arriere', 'arrieres', 'arrierer',
  'creance', 'creances', 'debiteur', 'crediteur',
  'dette', 'dettes',
  'recette', 'recettes', 'depense', 'depenses',
  'budget', 'bilan',
  'provision', 'provisions', 'amortissement',
  'tva', 'ht', 'ttc',
  'remise', 'avoir', 'avoirs',
  'devis', 'proforma',
  'echeance', 'echeances', 'relance', 'relances',
  'mise en demeure', 'penalite', 'penalites',
  'interet', 'interets',
  'marge', 'benefice', 'perte', 'resultat',
  'tresorerie',
  // Termes juridiques (données du cabinet, pas culture générale)
  'contentieux', 'juridique', 'tribunal',
  'jugement', 'assignation', 'requete',
  'conclusion', 'conclusions', 'plaidoirie',
  'greffe', 'magistrat',
  // Tables techniques
  'savings', 'loan',
];

/**
 * Entités reconnaissables dans l'historique de conversation.
 * Permettent de résoudre les questions de suivi avec pronoms anaphoriques :
 *   "donne moi celle qui est payée" → détecte "facture" dans l'historique
 * Les patterns sont des regex (sans accents, insensibles à la casse).
 */
export const DOMAIN_ENTITIES: AiDatabaseProjectConfig['domainEntities'] = [
  { pattern: 'factures?', label: 'facture' },
  { pattern: 'paiements?', label: 'paiement' },
  { pattern: 'dossiers?', label: 'dossier' },
  { pattern: 'clients?|customer', label: 'client' },
  { pattern: 'audiences?', label: 'audience' },
  { pattern: 'avocats?|employee', label: 'avocat' },
  { pattern: 'diligences?', label: 'diligence' },
  { pattern: 'documents?', label: 'document' },
  { pattern: 'ecritures?\\s*comptables?', label: 'ecriture comptable' },
  { pattern: 'comptes?', label: 'compte' },
  { pattern: 'exercices?', label: 'exercice' },
  { pattern: 'journa(?:l|ux)', label: 'journal comptable' },
  { pattern: 'actions?|sous[ -]?actions?|traitement', label: 'action de traitement' },
  { pattern: 'recommandations?|prochaine action|action suivante', label: 'recommandation' },
  { pattern: 'elements? facturables?|travaux a facturer|frais a facturer', label: 'element facturable' },
];

export const DATABASE_TABLES_CONFIG: AiDatabaseProjectConfig['databaseTablesConfig'] = {
  essentialTables: [
    'dossiers', 'customer', 'employee', 'dossier_actions', 'dossier_recommendations',
    'billable_items', 'dossier_billing_profiles', 'factures', 'invoice_lines',
    'paiements', 'audiences', 'document_customer', 'diligences', 'findings',
    'case_action_definitions', 'dossier_action_document_links',
    'dossier_action_audience_links', 'dossier_action_relations',
  ],
  ignoredTables: [
    'history_entries', 'auth_tokens', 'otp_codes', 'otp_online_link', 'sequence',
    'user_notifications',
    // Ancien moteur de procédure : remplacé par le parcours orienté actions.
    'procedure_instances', 'procedure_templates', 'stages', 'stage_visits',
    'sub_stage_visits', 'sub_stages', 'transitions', 'cycles', 'tasks',
    'stage_configs', 'decisions',
  ],
  sampling: { sampleRows: 2, maxStringLength: 200 },
  tableDescriptions: {
    dossiers: 'Dossiers du cabinet. Le traitement courant est suivi par dossier_actions et dossier_recommendations.',
    customer: 'Clients (particuliers et entreprises)',
    employee: 'Avocats et collaborateurs',
    audiences: 'Audiences programmees',
    step: 'Etapes procedurales',
    factures: 'Factures emises. Source du chiffre d\'affaires facture HT du cabinet.',
    paiements: 'Paiements recus. Source des montants encaisses uniquement quand la question parle d\'encaissement/paiement recu.',
    savings_account: 'Comptes epargne clients',
    loan: 'Prets accordes',
    case_action_definitions: 'Définitions versionnées des actions disponibles dans le parcours de traitement.',
    dossier_actions: 'Actions de traitement planifiées, démarrées ou terminées dans un dossier.',
    dossier_recommendations: 'Prochaines actions recommandées pour un dossier.',
    dossier_billing_profiles: 'Convention et paramètres de facturation propres à un dossier.',
    billable_items: 'Travaux, honoraires et frais à contrôler ou à facturer.',
    invoice_lines: 'Lignes de facture issues des éléments facturables.',
  },
  tableSynonyms: {
    factures: [
      'chiffre d affaires',
      'chiffre d affaire',
      'ca',
      'revenu facture',
      'revenus factures',
      'revenu facture ht',
      'honoraires factures',
      'montant facture',
      'montant facture ht',
    ],
    paiements: [
      'chiffre d affaires encaisse',
      'chiffre d affaire encaisse',
      'ca encaisse',
      'revenu encaisse',
      'montant encaisse',
      'paiements recus',
    ],
    dossier_actions: [
      'traitement',
      'action',
      'actions du dossier',
      'action en cours',
      'action terminee',
      'etape en cours',
      'avancement du dossier',
    ],
    dossier_recommendations: [
      'prochaine action',
      'action suivante',
      'action recommandee',
      'recommandation',
    ],
    case_action_definitions: [
      'catalogue d actions',
      'type d action',
      'sous action',
    ],
    billable_items: [
      'element facturable',
      'elements a facturer',
      'travaux a facturer',
      'frais a facturer',
      'honoraires a facturer',
    ],
    dossier_billing_profiles: [
      'mode de facturation',
      'convention d honoraires',
      'tarif du dossier',
    ],
    invoice_lines: [
      'ligne de facture',
      'detail de facture',
    ],
  },
};
