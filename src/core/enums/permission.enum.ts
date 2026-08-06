/**
 * Codes de permission — référence unique front + back.
 * Ces codes correspondent exactement à ce qui est stocké en DB (table permission.code)
 * et embarqué dans le JWT (payload.permissions[]).
 */
export enum Permission {
  // ── Dossiers ────────────────────────────────────────────────────────────
  VIEW_DOSSIERS             = 'view_dossiers',
  CREATE_DOSSIER            = 'create_dossier',
  EDIT_DOSSIER              = 'edit_dossier',
  DELETE_DOSSIER            = 'delete_dossier',
  ASSIGN_DOSSIER            = 'assign_dossier',
  VIEW_DOSSIER_CONFIDENTIAL = 'view_dossier_confidential',

  // ── Audiences ───────────────────────────────────────────────────────────
  VIEW_AUDIENCES            = 'view_audiences',
  CREATE_AUDIENCE           = 'create_audience',
  EDIT_AUDIENCE             = 'edit_audience',
  DELETE_AUDIENCE           = 'delete_audience',
  CANCEL_AUDIENCE           = 'cancel_audience',
  EXPORT_AUDIENCE           = 'export_audience',
  CONFIRM_AUDIENCE          = 'confirm_audience',
  POSTPONE_AUDIENCE         = 'postpone_audience',
  MARK_AUDIENCE_HELD        = 'mark_audience_held',

  // ── Factures & Finances ─────────────────────────────────────────────────
  VIEW_FACTURES             = 'view_factures',
  CREATE_FACTURE            = 'create_facture',
  EDIT_FACTURE              = 'edit_facture',
  DELETE_FACTURE            = 'delete_facture',
  ARCHIVE_FACTURE           = 'archive_facture',
  PRINT_FACTURE             = 'print_facture',
  EMAIL_FACTURE             = 'email_facture',
  DOWNLOAD_FACTURE          = 'download_facture',
  VIEW_FINANCIAL_REPORTS    = 'view_financial_reports',
  MANAGE_PAYMENTS           = 'manage_payments',
  CREATE_PAIEMENT           = 'create_paiement',
  EDIT_PAIEMENT             = 'edit_paiement',
  DELETE_PAIEMENT           = 'delete_paiement',

  // ── Diligences ──────────────────────────────────────────────────────────
  VIEW_DILIGENCES               = 'view_diligences',
  CREATE_DILIGENCE              = 'create_diligence',
  EDIT_DILIGENCE                = 'edit_diligence',
  DELETE_DILIGENCE              = 'delete_diligence',
  COMPLETE_DILIGENCE            = 'complete_diligence',
  ASSIGN_DILIGENCE              = 'assign_diligence',
  GENERATE_DILIGENCE_REPORT     = 'generate_diligence_report',
  DOWNLOAD_DILIGENCE_REPORT     = 'download_diligence_report',
  VIEW_DILIGENCE_FINDINGS       = 'view_diligence_findings',
  CREATE_DILIGENCE_FINDING      = 'create_diligence_finding',
  EDIT_DILIGENCE_FINDING        = 'edit_diligence_finding',
  DELETE_DILIGENCE_FINDING      = 'delete_diligence_finding',
  ATTACH_DOCUMENT_TO_DILIGENCE  = 'attach_document_to_diligence',
  ADD_DILIGENCE_NOTE            = 'add_diligence_note',

  // ── Clients ─────────────────────────────────────────────────────────────
  VIEW_CLIENTS              = 'view_clients',
  CREATE_CLIENT             = 'create_client',
  EDIT_CLIENT               = 'edit_client',
  DELETE_CLIENT             = 'delete_client',
  IMPORT_CLIENTS            = 'import_clients',
  EXPORT_CLIENTS            = 'export_clients',

  // ── Documents ───────────────────────────────────────────────────────────
  VIEW_DOCUMENTS            = 'view_documents',
  UPLOAD_DOCUMENT           = 'upload_document',
  EDIT_DOCUMENT             = 'edit_document',
  DELETE_DOCUMENT           = 'delete_document',
  SIGN_DOCUMENT             = 'sign_document',
  SHARE_DOCUMENT            = 'share_document',
  ARCHIVE_DOCUMENT          = 'archive_document',
  VALIDATE_DOCUMENT         = 'validate_document',
  REJECT_DOCUMENT           = 'reject_document',
  DOWNLOAD_DOCUMENT         = 'download_document',
  RESTORE_DOCUMENT          = 'restore_document',

  // ── Agenda & Événements ─────────────────────────────────────────────────
  VIEW_AGENDA               = 'view_agenda',
  CREATE_EVENT              = 'create_event',
  EDIT_EVENT                = 'edit_event',
  DELETE_EVENT              = 'delete_event',
  VIEW_ALL_AGENDAS          = 'view_all_agendas',

  // ── Utilisateurs & Administration ────────────────────────────────────────
  VIEW_USERS                = 'view_users',
  CREATE_USER               = 'create_user',
  EDIT_USER                 = 'edit_user',
  DELETE_USER               = 'delete_user',
  MANAGE_ROLES              = 'manage_roles',
  VIEW_AUDIT_LOGS           = 'view_audit_logs',
  MANAGE_SETTINGS           = 'manage_settings',

  // ── Communications ──────────────────────────────────────────────────────
  VIEW_MESSAGES             = 'view_messages',
  SEND_MESSAGE              = 'send_message',
  DELETE_MESSAGE            = 'delete_message',
  VIEW_ALL_MESSAGES         = 'view_all_messages',
  SEND_NOTIFICATION         = 'send_notification',
  BROADCAST_NOTIFICATION    = 'broadcast_notification',

  // ── Rapports & Statistiques ─────────────────────────────────────────────
  VIEW_REPORTS              = 'view_reports',
  CREATE_REPORTS            = 'create_reports',
  EXPORT_REPORTS            = 'export_reports',
  VIEW_DASHBOARD            = 'view_dashboard',
  VIEW_ANALYTICS            = 'view_analytics',
  USE_AI_ASSISTANT          = 'use_ai_assistant',

  // ── Apporteurs ──────────────────────────────────────────────────────────
  VIEW_REFERRERS                = 'view_referrers',
  CREATE_REFERRER               = 'create_referrer',
  EDIT_REFERRER                 = 'edit_referrer',
  DELETE_REFERRER               = 'delete_referrer',
  VIEW_DOSSIER_REFERRALS        = 'view_dossier_referrals',
  CREATE_DOSSIER_REFERRAL       = 'create_dossier_referral',
  EDIT_DOSSIER_REFERRAL         = 'edit_dossier_referral',
  DELETE_DOSSIER_REFERRAL       = 'delete_dossier_referral',
  VIEW_REFERRAL_COMMISSIONS     = 'view_referral_commissions',
  CREATE_REFERRAL_COMMISSION    = 'create_referral_commission',
  EDIT_REFERRAL_COMMISSION      = 'edit_referral_commission',
  VALIDATE_REFERRAL_COMMISSION  = 'validate_referral_commission',
  PAY_REFERRAL_COMMISSION       = 'pay_referral_commission',

  // ── Paie ────────────────────────────────────────────────────────────────
  VIEW_PAYROLL              = 'view_payroll',
  VIEW_PAYROLL_PERIODS      = 'view_payroll_periods',
  CREATE_PAYROLL_PERIOD     = 'create_payroll_period',
  EDIT_PAYROLL_PERIOD       = 'edit_payroll_period',
  CLOSE_PAYROLL_PERIOD      = 'close_payroll_period',
  VIEW_PAYSLIPS             = 'view_payslips',
  VIEW_OWN_PAYSLIP          = 'view_own_payslip',
  GENERATE_PAYSLIP          = 'generate_payslip',
  EDIT_PAYSLIP              = 'edit_payslip',
  VALIDATE_PAYSLIP          = 'validate_payslip',
  PAY_PAYSLIP               = 'pay_payslip',
  MANAGE_PAYROLL_RATES      = 'manage_payroll_rates',
  DOWNLOAD_PAYSLIP          = 'download_payslip',
  EMAIL_PAYSLIP             = 'email_payslip',

  // ── Dépenses ────────────────────────────────────────────────────────────
  VIEW_EXPENSES             = 'view_expenses',
  VIEW_SUPPLIERS            = 'view_suppliers',
  CREATE_SUPPLIER           = 'create_supplier',
  EDIT_SUPPLIER             = 'edit_supplier',
  DELETE_SUPPLIER           = 'delete_supplier',
  VIEW_SUPPLIER_INVOICES    = 'view_supplier_invoices',
  CREATE_SUPPLIER_INVOICE   = 'create_supplier_invoice',
  EDIT_SUPPLIER_INVOICE     = 'edit_supplier_invoice',
  DELETE_SUPPLIER_INVOICE   = 'delete_supplier_invoice',
  VALIDATE_SUPPLIER_INVOICE = 'validate_supplier_invoice',
  PAY_SUPPLIER_INVOICE      = 'pay_supplier_invoice',
  VIEW_EXPENSE_REPORTS      = 'view_expense_reports',
  CREATE_EXPENSE_REPORT     = 'create_expense_report',
  EDIT_EXPENSE_REPORT       = 'edit_expense_report',
  DELETE_EXPENSE_REPORT     = 'delete_expense_report',
  VALIDATE_EXPENSE_REPORT   = 'validate_expense_report',
  REIMBURSE_EXPENSE_REPORT  = 'reimburse_expense_report',

  // ── Système ─────────────────────────────────────────────────────────────
  SUPER_ADMIN               = 'SUPER_ADMIN',
  AUDIT_SYSTEM              = 'AUDIT_SYSTEM',
}
