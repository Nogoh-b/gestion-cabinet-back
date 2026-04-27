export const DatabaseTablesConfig = {
  // Tables essentielles pour l'analyse (pour éviter de charger toutes les tables)
  essentialTables: [
    "dossiers",
    "customer",
    "employee",
    "audiences",
    "factures",
    "paiements",
    "document_customer",
    "diligences",
    "findings",
    "stages",
    "stage_visits",
    "sub_stage_visits",
    "sub_stages",
    "procedure_instances",
    "procedure_templates",
    "transitions",
  ],

  // Tables à ignorer complètement
  ignoredTables: [
    'history_entries',
    'auth_tokens',
    'otp_codes',
    'otp_online_link',
    'sequence',
    'user_notifications'
  ],

  // Configuration des échantillons
  sampling: {
    sampleRows: 2,        // Nombre de lignes exemple par table
    maxStringLength: 200, // Troncature des longs textes
  },

  // Métadonnées pour guider l'IA
  tableDescriptions: {
    dossiers: "Dossiers contentieux du cabinet",
    customer: "Clients (particuliers et entreprises)",
    employee: "Avocats et collaborateurs",
    audiences: "Audiences programmées",
    step: "Étapes procédurales",
    factures: "Factures émises",
    paiements: "Paiements reçus",
    savings_account: "Comptes épargne clients",
    loan: "Prêts accordés"
  }
};