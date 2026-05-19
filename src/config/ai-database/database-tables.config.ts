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
    dossiers: 'Dossiers contentieux du cabinet. Un dossier a une instance de procédure (procedureInstanceId → procedure_instances.id)',
    customer: 'Clients (particuliers et entreprises)',
    employee: 'Avocats et collaborateurs',
    audiences: 'Audiences programmées',
    step: 'Étapes procédurales',
    factures: 'Factures émises',
    paiements: 'Paiements reçus',
    savings_account: 'Comptes épargne clients',
    loan: 'Prêts accordés',
    procedure_instances: 'Instance de procédure d\'un dossier. Liée à dossiers.procedureInstanceId',
    stages: 'Étapes d\'une procédure',
    stage_visits: 'Visite d\'une étape pour une instance. instanceId → procedure_instances.id, stageId → stages.id',
  },
};
