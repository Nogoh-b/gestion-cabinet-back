/**
 * Entités jamais créées automatiquement par l'IA dans ce projet.
 * Modifiable librement — n'impacte pas le module core AiDatabase.
 */
export const NEVER_AUTO_CREATE_ENTITIES: string[] = [
  // Identité/sécurité — nécessitent un User préalable (FK id → user.id)
  'employee', 'employees',
  // Données de référence : doivent exister en base
  'procedure_types', 'procedure_type',
  'jurisdictions', 'jurisdiction',
  'agencies', 'agency',
  // Workflow : FK obligatoires impossibles à déduire d'un texte
  'procedure_instances', 'procedure_instance',
  'procedure_templates', 'procedure_template',
  'stages', 'stage',
  'sub_stages', 'sub_stage',
  'transitions', 'transition',
  'cycles', 'cycle',
  'tasks', 'task',
  'stage_visits', 'sub_stage_visits',
  'history_entries', 'history_entry',
  // Entités avec FK obligatoires sur entités sensibles
  'payslip', 'payslips',
  'payslip_line', 'payslip_lines',
  'payroll_period', 'payroll_periods',
  'expense_report', 'expense_reports',
  'expense_line', 'expense_lines',
  'paiements', 'paiement',
  // Structurel, géré par admin
  'branch', 'branches',
  // Documents : nécessitent un vrai fichier uploadé via l'interface dédiée
  'documents', 'document', 'document_customers', 'document_customer',
  'document_types', 'document_type',
];
