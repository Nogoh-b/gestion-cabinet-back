import { Permission } from 'src/modules/iam/permission/entities/permission.entity';
import { Repository } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class PermissionSeeder {
  private readonly logger = new Logger(PermissionSeeder.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async seed() {
    this.logger.log('Seeding permissions...');

    const permissions: { code: string; description: string; canChange?: number }[] = [

      // ===================================================================
      // CABINET — DOSSIERS
      // ===================================================================
      { code: 'view_dossiers',           description: 'Voir les dossiers' },
      { code: 'create_dossier',          description: 'Créer un dossier' },
      { code: 'edit_dossier',            description: 'Modifier un dossier' },
      { code: 'delete_dossier',          description: 'Supprimer un dossier' },
      { code: 'assign_dossier',          description: 'Assigner un dossier à un avocat' },
      { code: 'view_dossier_confidential', description: 'Voir les informations confidentielles d\'un dossier' },

      // ===================================================================
      // CABINET — AUDIENCES
      // ===================================================================
      { code: 'view_audiences',          description: 'Voir les audiences' },
      { code: 'create_audience',         description: 'Créer une audience' },
      { code: 'edit_audience',           description: 'Modifier une audience' },
      { code: 'delete_audience',         description: 'Supprimer une audience' },
      { code: 'cancel_audience',         description: 'Annuler une audience' },
      { code: 'export_audience',         description: 'Exporter les audiences' },
      { code: 'confirm_audience',        description: 'Confirmer une audience' },
      { code: 'postpone_audience',       description: 'Reporter une audience' },
      { code: 'mark_audience_held',      description: 'Marquer une audience comme tenue' },

      // ===================================================================
      // CABINET — FACTURES & FINANCES
      // ===================================================================
      { code: 'view_factures',           description: 'Voir les factures' },
      { code: 'create_facture',          description: 'Créer une facture' },
      { code: 'edit_facture',            description: 'Modifier une facture' },
      { code: 'delete_facture',          description: 'Supprimer une facture' },
      { code: 'archive_facture',         description: 'Archiver une facture' },
      { code: 'print_facture',           description: 'Imprimer une facture' },
      { code: 'email_facture',           description: 'Envoyer une facture par email' },
      { code: 'download_facture',        description: 'Télécharger une facture' },
      { code: 'view_financial_reports',  description: 'Voir les rapports financiers' },
      { code: 'manage_payments',         description: 'Gérer les paiements' },
      { code: 'create_paiement',         description: 'Enregistrer un paiement' },
      { code: 'edit_paiement',           description: 'Modifier un paiement' },
      { code: 'delete_paiement',         description: 'Supprimer un paiement' },

      // ===================================================================
      // CABINET — DILIGENCES
      // ===================================================================
      { code: 'view_diligences',             description: 'Voir les diligences' },
      { code: 'create_diligence',            description: 'Créer une diligence' },
      { code: 'edit_diligence',              description: 'Modifier une diligence' },
      { code: 'delete_diligence',            description: 'Supprimer une diligence' },
      { code: 'complete_diligence',          description: 'Marquer une diligence comme terminée' },
      { code: 'assign_diligence',            description: 'Assigner une diligence' },
      { code: 'generate_diligence_report',   description: 'Générer un rapport de diligence' },
      { code: 'download_diligence_report',   description: 'Télécharger un rapport de diligence' },
      { code: 'view_diligence_findings',     description: 'Voir les findings de diligence' },
      { code: 'create_diligence_finding',    description: 'Créer un finding de diligence' },
      { code: 'edit_diligence_finding',      description: 'Modifier un finding de diligence' },
      { code: 'delete_diligence_finding',    description: 'Supprimer un finding de diligence' },
      { code: 'attach_document_to_diligence', description: 'Attacher un document à une diligence' },
      { code: 'add_diligence_note',          description: 'Ajouter une note à une diligence' },

      // ===================================================================
      // CABINET — CLIENTS
      // ===================================================================
      { code: 'view_clients',            description: 'Voir les clients' },
      { code: 'create_client',           description: 'Créer un client' },
      { code: 'edit_client',             description: 'Modifier un client' },
      { code: 'delete_client',           description: 'Supprimer un client' },
      { code: 'import_clients',          description: 'Importer des clients' },
      { code: 'export_clients',          description: 'Exporter des clients' },

      // ===================================================================
      // CABINET — DOCUMENTS
      // ===================================================================
      { code: 'view_documents',          description: 'Voir les documents' },
      { code: 'upload_document',         description: 'Uploader un document' },
      { code: 'edit_document',           description: 'Modifier un document' },
      { code: 'delete_document',         description: 'Supprimer un document' },
      { code: 'sign_document',           description: 'Signer un document' },
      { code: 'share_document',          description: 'Partager un document' },
      { code: 'archive_document',        description: 'Archiver un document' },
      { code: 'validate_document',       description: 'Valider un document' },
      { code: 'reject_document',         description: 'Rejeter un document' },
      { code: 'download_document',       description: 'Télécharger un document' },
      { code: 'restore_document',        description: 'Restaurer un document archivé' },

      // ===================================================================
      // CABINET — AGENDA & ÉVÉNEMENTS
      // ===================================================================
      { code: 'view_agenda',             description: 'Voir l\'agenda' },
      { code: 'create_event',            description: 'Créer un événement' },
      { code: 'edit_event',              description: 'Modifier un événement' },
      { code: 'delete_event',            description: 'Supprimer un événement' },
      { code: 'view_all_agendas',        description: 'Voir tous les agendas du cabinet' },

      // ===================================================================
      // CABINET — UTILISATEURS & ADMINISTRATION
      // ===================================================================
      { code: 'view_users',              description: 'Voir les utilisateurs' },
      { code: 'create_user',             description: 'Créer un utilisateur' },
      { code: 'edit_user',               description: 'Modifier un utilisateur' },
      { code: 'delete_user',             description: 'Supprimer un utilisateur' },
      { code: 'manage_roles',            description: 'Gérer les rôles et permissions' },
      { code: 'view_audit_logs',         description: 'Voir les logs d\'audit' },
      { code: 'manage_settings',         description: 'Gérer les paramètres du cabinet' },

      // ===================================================================
      // CABINET — COMMUNICATIONS
      // ===================================================================
      { code: 'view_messages',           description: 'Voir les messages' },
      { code: 'send_message',            description: 'Envoyer un message' },
      { code: 'delete_message',          description: 'Supprimer un message' },
      { code: 'view_all_messages',       description: 'Voir tous les messages du cabinet' },

      // ===================================================================
      // CABINET — RAPPORTS & STATISTIQUES
      // ===================================================================
      { code: 'view_reports',            description: 'Voir les rapports' },
      { code: 'create_reports',          description: 'Créer des rapports' },
      { code: 'export_reports',          description: 'Exporter des rapports' },
      { code: 'view_dashboard',          description: 'Voir le tableau de bord' },
      { code: 'view_analytics',          description: 'Voir les statistiques avancées' },

      // ===================================================================
      // CABINET — APPORTEURS (REFERRERS)
      // ===================================================================
      { code: 'view_referrers',              description: 'Voir les apporteurs' },
      { code: 'create_referrer',             description: 'Créer un apporteur' },
      { code: 'edit_referrer',               description: 'Modifier un apporteur' },
      { code: 'delete_referrer',             description: 'Supprimer un apporteur' },
      { code: 'view_dossier_referrals',      description: 'Voir les apports liés aux dossiers' },
      { code: 'create_dossier_referral',     description: 'Lier un apporteur à un dossier' },
      { code: 'edit_dossier_referral',       description: 'Modifier un apport dossier' },
      { code: 'delete_dossier_referral',     description: 'Supprimer un apport dossier' },
      { code: 'view_referral_commissions',   description: 'Voir les commissions d\'apporteur' },
      { code: 'create_referral_commission',  description: 'Créer une commission d\'apporteur' },
      { code: 'edit_referral_commission',    description: 'Modifier une commission d\'apporteur' },
      { code: 'validate_referral_commission', description: 'Valider une commission d\'apporteur' },
      { code: 'pay_referral_commission',     description: 'Payer une commission d\'apporteur' },

      // ===================================================================
      // CABINET — PAIE (PAYROLL)
      // ===================================================================
      { code: 'view_payroll',            description: 'Voir la section paie' },
      { code: 'view_payroll_periods',    description: 'Voir les périodes de paie' },
      { code: 'create_payroll_period',   description: 'Créer une période de paie' },
      { code: 'edit_payroll_period',     description: 'Modifier une période de paie' },
      { code: 'close_payroll_period',    description: 'Clôturer une période de paie' },
      { code: 'view_payslips',           description: 'Voir les bulletins de paie' },
      { code: 'generate_payslip',        description: 'Générer un bulletin de paie' },
      { code: 'edit_payslip',            description: 'Modifier un bulletin de paie' },
      { code: 'download_payslip',        description: 'Télécharger un bulletin de paie' },
      { code: 'email_payslip',           description: 'Envoyer un bulletin de paie par email' },

      // ===================================================================
      // CABINET — DÉPENSES (EXPENSES)
      // ===================================================================
      { code: 'view_expenses',               description: 'Voir les dépenses' },
      { code: 'view_suppliers',              description: 'Voir les fournisseurs' },
      { code: 'create_supplier',             description: 'Créer un fournisseur' },
      { code: 'edit_supplier',               description: 'Modifier un fournisseur' },
      { code: 'delete_supplier',             description: 'Supprimer un fournisseur' },
      { code: 'view_supplier_invoices',      description: 'Voir les factures fournisseur' },
      { code: 'create_supplier_invoice',     description: 'Créer une facture fournisseur' },
      { code: 'edit_supplier_invoice',       description: 'Modifier une facture fournisseur' },
      { code: 'delete_supplier_invoice',     description: 'Supprimer une facture fournisseur' },
      { code: 'validate_supplier_invoice',   description: 'Valider une facture fournisseur' },
      { code: 'pay_supplier_invoice',        description: 'Payer une facture fournisseur' },
      { code: 'view_expense_reports',        description: 'Voir les notes de frais' },
      { code: 'create_expense_report',       description: 'Créer une note de frais' },
      { code: 'edit_expense_report',         description: 'Modifier une note de frais' },
      { code: 'delete_expense_report',       description: 'Supprimer une note de frais' },
      { code: 'validate_expense_report',     description: 'Valider une note de frais' },
      { code: 'reimburse_expense_report',    description: 'Rembourser une note de frais' },

      // ===================================================================
      // CABINET — MODÈLES PDF (PDF TEMPLATES)
      // ===================================================================
      { code: 'view_pdf_templates',      description: 'Voir les modèles PDF' },
      { code: 'create_pdf_template',     description: 'Créer un modèle PDF' },
      { code: 'edit_pdf_template',       description: 'Modifier un modèle PDF' },
      { code: 'delete_pdf_template',     description: 'Supprimer un modèle PDF' },

      // ===================================================================
      // SYSTÈME — Permissions spéciales (non modifiables)
      // ===================================================================
      { code: 'SUPER_ADMIN',    description: 'Accès total au système',        canChange: 0 },
      { code: 'AUDIT_SYSTEM',   description: 'Auditer toutes les actions',    canChange: 0 },

      // ===================================================================
      // LEGACY — Codes utilisés par les controllers existants (conservés pour compatibilité)
      // ===================================================================
      { code: 'MANAGE_ROLE',              description: '[legacy] Gestion des rôles' },
      { code: 'MANAGE_LOCATION',          description: '[legacy] Gestion des localisations' },
      { code: 'MANAGE_JURISDICTIONS',     description: '[legacy] Gestion des juridictions' },
      { code: 'MANAGE_INVOICE_TYPES',     description: '[legacy] Gestion des types de facture' },
      { code: 'MANAGE_AUDIENCE_TYPES',    description: '[legacy] Gestion des types d\'audience' },
      { code: 'MANAGE_DOCUMENT_CATEGORIES', description: '[legacy] Gestion des catégories de document' },
      { code: 'MANAGE_EXPENSES',          description: '[legacy] Gestion des dépenses' },
      { code: 'MANAGE_PAYROLL',           description: '[legacy] Gestion de la paie' },
      { code: 'MANAGE_REFERRERS',         description: '[legacy] Gestion des apporteurs' },
      { code: 'CREATE_EMPLOYEE',          description: '[legacy] Créer un employé' },
      { code: 'VIEW_EMPLOYEE',            description: '[legacy] Voir les employés' },
      { code: 'EDIT_EMPLOYEE',            description: '[legacy] Modifier un employé' },
      { code: 'DELETE_EMPLOYEE',          description: '[legacy] Supprimer un employé' },
      { code: 'CREATE_CUSTOMER',          description: '[legacy] Créer un client' },
      { code: 'VIEW_CUSTOMER',            description: '[legacy] Voir les clients' },
      { code: 'EDIT_CUSTOMER',            description: '[legacy] Modifier un client' },
      { code: 'DELETE_CUSTOMER',          description: '[legacy] Supprimer un client' },
      { code: 'VERIFY_CUSTOMER_KYC',      description: '[legacy] Valider le KYC client' },
      { code: 'CREATE_DOCUMENT_TYPE',     description: '[legacy] Créer un type de document' },
      { code: 'VIEW_DOCUMENT_TYPE',       description: '[legacy] Voir les types de document' },
      { code: 'EDIT_DOCUMENT_TYPE',       description: '[legacy] Modifier un type de document' },
      { code: 'DELETE_DOCUMENT_TYPE',     description: '[legacy] Supprimer un type de document' },
      { code: 'CREATE_TYPE_CUSTOMER',     description: '[legacy] Créer un type client' },
      { code: 'GET_TYPE_CUSTOMER',        description: '[legacy] Voir les types client' },
      { code: 'UPDATE_TYPE_CUSTOMER',     description: '[legacy] Modifier un type client' },
      { code: 'ASSIGN_TYPE_CUSTOMER',     description: '[legacy] Assigner un type client' },
      { code: 'CREATE_RESSOURCE',         description: '[legacy] Créer une ressource' },
      { code: 'DELETE_RESSOURCE',         description: '[legacy] Supprimer une ressource' },
      { code: 'CREATE_TYPE_RESSOURCE',    description: '[legacy] Créer un type de ressource' },
      { code: 'EDIT_TYPE_RESSOURCE',      description: '[legacy] Modifier un type de ressource' },
      { code: 'DELETE_TYPE_RESSOURCE',    description: '[legacy] Supprimer un type de ressource' },
      { code: 'DELETE_BRANCH',            description: '[legacy] Supprimer une agence' },
    ];

    let created = 0;
    let skipped = 0;

    for (const perm of permissions) {
      const exists = await this.permissionRepo.findOne({ where: { code: perm.code } });
      if (!exists) {
        await this.permissionRepo.save(this.permissionRepo.create(perm));
        created++;
      } else {
        skipped++;
      }
    }

    this.logger.log(`Permissions: ${created} créées, ${skipped} déjà existantes.`);
  }
}
