import { AiDatabaseProjectConfig } from 'src/core/ai-database/interfaces/ai-database-project-config.interface';

/**
 * Mots-clés du domaine métier (sans accents, minuscules).
 * Le classificateur d'intention les utilise pour distinguer les questions
 * portant sur les données du cabinet (READ/WRITE) des questions générales (CHAT).
 */
export const DOMAIN_KEYWORDS: AiDatabaseProjectConfig['domainKeywords'] = [
  // Entités principales
  'dossier', 'dossiers', 'client', 'clients', 'customer',
  'audience', 'audiences', 'facture', 'factures',
  'paiement', 'paiements', 'document', 'documents',
  'avocat', 'avocats', 'employee', 'employe', 'employes',
  'diligence', 'diligences',
  // Comptabilité
  'ecriture', 'ecritures', 'compte', 'comptes',
  'journal', 'journaux', 'exercice', 'exercices',
  'salaire', 'salaires',
  // Procédures
  'procedure', 'procedures', 'etape', 'etapes', 'stage',
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
  // Procédure / étapes (workflow d'un dossier)
  { pattern: 'etape en cours|etape courante|etape actuelle|etape du moment', label: 'etape en cours' },
  { pattern: 'prochaine etape|etape suivante|prochaine action|etape a faire|etape a venir|etape suivante a faire', label: 'prochaine etape' },
  { pattern: 'procedures?|procedure instance|instance de procedure', label: 'procedure' },
];

export const DATABASE_TABLES_CONFIG: AiDatabaseProjectConfig['databaseTablesConfig'] = {
  essentialTables: [
    'dossiers', 'customer', 'employee', 'audiences', 'factures', 'paiements',
    'document_customer', 'diligences', 'findings', 'stages', 'stage_visits',
    'sub_stage_visits', 'sub_stages', 'procedure_instances', 'procedure_templates', 'transitions',
  ],
  ignoredTables: ['history_entries', 'auth_tokens', 'otp_codes', 'otp_online_link', 'sequence', 'user_notifications'],
  sampling: { sampleRows: 2, maxStringLength: 200 },
  tableDescriptions: {
    dossiers: 'Dossiers contentieux du cabinet. Un dossier a une instance de procedure (procedureInstanceId -> procedure_instances.id)',
    customer: 'Clients (particuliers et entreprises)',
    employee: 'Avocats et collaborateurs',
    audiences: 'Audiences programmees',
    step: 'Etapes procedurales',
    factures: 'Factures emises. Source du chiffre d\'affaires facture HT du cabinet.',
    paiements: 'Paiements recus. Source des montants encaisses uniquement quand la question parle d\'encaissement/paiement recu.',
    savings_account: 'Comptes epargne clients',
    loan: 'Prets accordes',
    procedure_instances: 'Instance de procedure d\'un dossier. Liee a dossiers.procedureInstanceId',
    stages: 'Etapes d\'une procedure',
    stage_visits: 'Visite d\'une etape pour une instance. instanceId -> procedure_instances.id, stageId -> stages.id',
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
    stages: [
      'etape',
      'etapes',
      'etape en cours',
      'etape courante',
      'etape actuelle',
      'prochaine etape',
      'etape suivante',
      'etape de procedure',
    ],
    stage_visits: [
      'etape en cours',
      'etape courante',
      'avancement',
      'progression',
      'visite d etape',
      'etat d avancement',
    ],
    procedure_instances: [
      'procedure',
      'instance de procedure',
      'avancement du dossier',
      'etat d avancement du dossier',
    ],
    procedure_templates: [
      'modele de procedure',
      'etapes de la procedure',
      'prochaine etape',
    ],
    transitions: [
      'prochaine etape',
      'etape suivante',
      'transition',
    ],
  },
};
