export const DatabaseTablesConfig = {
  // Tables essentielles pour l'analyse (pour éviter de charger toutes les tables)
  essentialTables: [
    "dossiers",
    "customer",
    "employee",
    "dossier_actions",
    "dossier_recommendations",
    "billable_items",
    "dossier_billing_profiles",
    "audiences",
    "factures",
    "paiements",
    "document_customer",
    "diligences",
    "findings",
    "invoice_lines",
  ],

  // Tables à ignorer complètement
  ignoredTables: [
    'history_entries',
    'auth_tokens',
    'otp_codes',
    'otp_online_link',
    'sequence',
    'user_notifications',
    'procedure_instances',
    'procedure_templates',
    'stages',
    'stage_visits',
    'sub_stage_visits',
    'sub_stages',
    'transitions',
    'cycles',
    'tasks',
    'stage_configs',
    'decisions'
  ],

  // Configuration des échantillons
  sampling: {
    sampleRows: 2,        // Nombre de lignes exemple par table
    maxStringLength: 200, // Troncature des longs textes
  },

  // Métadonnées pour guider l'IA
  tableDescriptions: {
    dossiers: "Dossiers du cabinet. Le traitement courant est suivi par dossier_actions et dossier_recommendations.",
    customer: "Clients (particuliers et entreprises)",
    employee: "Avocats et collaborateurs",
    audiences: "Audiences programmées",
    step: "Étapes procédurales",
    factures: "Factures émises",
    paiements: "Paiements reçus",
    savings_account: "Comptes épargne clients",
    loan: "Prêts accordés",
    dossier_actions: "Actions de traitement d'un dossier",
    dossier_recommendations: "Prochaines actions recommandées",
    dossier_billing_profiles: "Paramètres de facturation du dossier",
    billable_items: "Travaux et frais à facturer",
    invoice_lines: "Lignes de facture issues des éléments facturables",
  },
};
