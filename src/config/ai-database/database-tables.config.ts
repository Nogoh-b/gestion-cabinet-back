import { AiDatabaseProjectConfig } from 'src/core/ai-database/interfaces/ai-database-project-config.interface';

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
  },
};
