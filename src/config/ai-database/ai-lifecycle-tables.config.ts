/**
 * Tables dont les écritures sont gouvernées par un cycle de vie métier
 * (statuts, versions, scellement, écritures comptables, audit).
 *
 * L'IA ne peut pas y faire d'INSERT/UPDATE/DELETE générique : seules les
 * actions métier (opération `ACTION`, qui passent par les services et leurs
 * contrôles de transition) sont autorisées. Aucun handler générique n'est
 * généré automatiquement pour ces tables.
 */
export const AI_LIFECYCLE_TABLES: ReadonlySet<string> = new Set([
  // Dossiers et accès
  'dossiers',
  'dossier_members',
  'dossier_access_grant',
  'dossier_referral',
  // Procédures (templates versionnés et instances)
  'procedure_templates',
  'stages',
  'sub_stages',
  'transitions',
  'cycles',
  'tasks',
  'stage_configs',
  'procedure_instances',
  'stage_visits',
  'sub_stage_visits',
  'history_entries',
  // Audiences et délais
  'audiences',
  'decisions',
  'legal_deadlines',
  // Facturation et encaissements
  'factures',
  'invoice_lines',
  'paiements',
  // Comptabilité
  'ecritures_comptables',
  'lignes_ecriture_comptable',
  'exercices_comptables',
  // Paie
  'payroll_period',
  'payroll_contribution',
  'payslip',
  'payslip_line',
  'salary_advance',
  // Fournisseurs et notes de frais
  'supplier_invoice',
  'expense_report',
  'expense_line',
  // Apporteurs
  'referral_commission',
  // Documents versionnés
  'document_customer',
  'document_customer_versions',
  'document_versions',
  // Journaux probatoires
  'audit_events',
  'outbox_events',
]);

export function isAiLifecycleTable(table: string | null | undefined): boolean {
  if (!table) return false;
  return AI_LIFECYCLE_TABLES.has(table.replace(/`/g, '').trim().toLowerCase());
}
