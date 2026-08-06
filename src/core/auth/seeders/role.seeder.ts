import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from 'src/modules/iam/user-role/entities/user-role.entity';
import { Permission } from 'src/modules/iam/permission/entities/permission.entity';
import { RolePermission } from 'src/modules/iam/role-permission/entities/role-permission.entity';
import { findOneForTenant } from 'src/core/tenant/seeder-helper';
import { getCurrentTenantId, hasActiveTenant } from 'src/core/tenant/tenant.context';

// ─── Configuration des rôles cabinet (miroir du front roles.permissions.ts) ─────

const ROLES_CONFIG: {
  code: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: string[];
}[] = [
  {
    code: 'admin',
    name: 'Administrateur',
    description: 'Accès complet à toutes les fonctionnalités du cabinet',
    isSystemRole: true,
    permissions: [
      // Dossiers
      'view_dossiers', 'create_dossier', 'edit_dossier', 'delete_dossier', 'assign_dossier', 'view_dossier_confidential',
      // Audiences
      'view_audiences', 'create_audience', 'edit_audience', 'delete_audience', 'cancel_audience',
      'export_audience', 'confirm_audience', 'postpone_audience', 'mark_audience_held',
      'schedule_audience_under_48h',
      // Factures & Finances
      'view_factures', 'create_facture', 'edit_facture', 'delete_facture', 'view_financial_reports', 'manage_payments',
      'archive_facture', 'print_facture', 'email_facture', 'download_facture',
      'create_paiement', 'edit_paiement', 'delete_paiement',
      // Clients
      'view_clients', 'create_client', 'edit_client', 'delete_client', 'import_clients', 'export_clients',
      // Documents
      'view_documents', 'upload_document', 'edit_document', 'delete_document', 'sign_document', 'share_document',
      'archive_document', 'validate_document', 'reject_document', 'download_document', 'restore_document',
      // Agenda
      'view_agenda', 'create_event', 'edit_event', 'delete_event', 'view_all_agendas',
      // Diligences
      'view_diligences', 'create_diligence', 'edit_diligence', 'delete_diligence',
      'generate_diligence_report', 'download_diligence_report', 'complete_diligence', 'assign_diligence',
      'view_diligence_findings', 'create_diligence_finding', 'edit_diligence_finding', 'delete_diligence_finding',
      'attach_document_to_diligence', 'add_diligence_note',
      // Utilisateurs & Administration
      'view_users', 'create_user', 'edit_user', 'delete_user', 'manage_roles', 'view_audit_logs', 'manage_settings',
      'manage_subscription',
      'use_ai_assistant',
      'override_dossier_closure',
      'manage_procedure_templates', 'apply_procedure_transition', 'approve_procedure_requirement',
      // Modèles PDF
      'view_pdf_templates', 'create_pdf_template', 'edit_pdf_template', 'delete_pdf_template',
      // Communications
      'view_messages', 'send_message', 'delete_message', 'view_all_messages',
      'send_notification', 'broadcast_notification',
      // Rapports
      'view_reports', 'create_reports', 'export_reports', 'view_dashboard', 'view_analytics',
      // Apporteurs
      'view_referrers', 'create_referrer', 'edit_referrer', 'delete_referrer',
      'view_dossier_referrals', 'create_dossier_referral', 'edit_dossier_referral', 'delete_dossier_referral',
      'view_referral_commissions', 'create_referral_commission', 'edit_referral_commission',
      'validate_referral_commission', 'pay_referral_commission',
      // Paie
      'view_payroll', 'view_payroll_periods', 'create_payroll_period', 'edit_payroll_period', 'close_payroll_period',
      'view_payslips', 'view_own_payslip', 'generate_payslip', 'edit_payslip',
      'validate_payslip', 'pay_payslip', 'manage_payroll_rates',
      'download_payslip', 'email_payslip',
      // Dépenses
      'view_expenses', 'view_suppliers', 'create_supplier', 'edit_supplier', 'delete_supplier',
      'view_supplier_invoices', 'create_supplier_invoice', 'edit_supplier_invoice', 'delete_supplier_invoice',
      'validate_supplier_invoice', 'pay_supplier_invoice',
      'view_expense_reports', 'create_expense_report', 'edit_expense_report', 'delete_expense_report',
      'validate_expense_report', 'reimburse_expense_report',
      // Comptabilité (accès complet)
      'view_accounting', 'create_ecriture', 'edit_ecriture', 'delete_ecriture',
      'manage_chart_of_accounts', 'open_exercice', 'close_exercice', 'view_accounting_reports',
    ],
  },

  {
    code: 'avocat',
    name: 'Avocat',
    description: 'Gestion complète des dossiers et audiences',
    isSystemRole: true,
    permissions: [
      // Dossiers
      'view_dossiers', 'create_dossier', 'edit_dossier', 'assign_dossier', 'view_dossier_confidential',
      'apply_procedure_transition', 'approve_procedure_requirement',
      // Audiences
      'view_audiences', 'create_audience', 'edit_audience', 'delete_audience', 'cancel_audience',
      'export_audience', 'confirm_audience', 'postpone_audience', 'mark_audience_held',
      // Clients
      'view_clients', 'create_client', 'edit_client', 'import_clients',
      // Documents
      'view_documents', 'upload_document', 'edit_document', 'sign_document', 'share_document',
      'archive_document', 'validate_document', 'reject_document', 'download_document', 'restore_document',
      // Agenda
      'view_agenda', 'create_event', 'edit_event', 'delete_event',
      // Diligences
      'view_diligences', 'create_diligence', 'edit_diligence', 'delete_diligence',
      'generate_diligence_report', 'download_diligence_report', 'complete_diligence', 'assign_diligence',
      'view_diligence_findings', 'create_diligence_finding', 'edit_diligence_finding', 'delete_diligence_finding',
      'attach_document_to_diligence', 'add_diligence_note',
      // Communications
      'view_messages', 'send_message', 'delete_message',
      // Rapports
      'view_reports', 'view_dashboard',
      // Apporteurs
      'view_referrers', 'view_dossier_referrals', 'create_dossier_referral',
      // Paie (consultation)
      'view_payroll', 'view_own_payslip', 'download_payslip',
      // Dépenses (consultation + notes de frais)
      'view_expenses', 'view_suppliers', 'view_supplier_invoices', 'view_expense_reports', 'create_expense_report',
      // Comptabilité (consultation)
      'view_accounting', 'view_accounting_reports',
    ],
  },

  {
    code: 'secretaire',
    name: 'Secrétaire',
    description: 'Gestion administrative et agenda',
    isSystemRole: true,
    permissions: [
      // Dossiers
      'view_dossiers', 'edit_dossier',
      // Audiences
      'view_audiences', 'create_audience', 'edit_audience', 'delete_audience', 'cancel_audience',
      'export_audience', 'confirm_audience', 'postpone_audience', 'mark_audience_held',
      // Factures
      'view_factures', 'create_facture', 'edit_facture',
      'archive_facture', 'print_facture', 'email_facture', 'download_facture',
      'create_paiement', 'edit_paiement',
      // Clients
      'view_clients', 'create_client', 'edit_client', 'import_clients', 'export_clients',
      // Documents
      'view_documents', 'upload_document', 'edit_document', 'share_document',
      'archive_document', 'download_document', 'restore_document',
      // Agenda
      'view_agenda', 'create_event', 'edit_event', 'delete_event',
      // Diligences
      'view_diligences', 'create_diligence', 'edit_diligence',
      'download_diligence_report',
      'view_diligence_findings', 'create_diligence_finding',
      'attach_document_to_diligence', 'add_diligence_note',
      // Communications
      'view_messages', 'send_message',
      // Rapports
      'view_reports',
      // Apporteurs
      'view_referrers', 'create_referrer', 'edit_referrer',
      'view_dossier_referrals', 'create_dossier_referral', 'edit_dossier_referral',
      'view_referral_commissions', 'create_referral_commission',
      // Paie (gestion complète)
      'view_payroll', 'view_payroll_periods', 'create_payroll_period', 'edit_payroll_period', 'close_payroll_period',
      'view_payslips', 'view_own_payslip', 'generate_payslip', 'edit_payslip',
      'pay_payslip', 'download_payslip', 'email_payslip',
      // Dépenses
      'view_expenses', 'view_suppliers', 'create_supplier', 'edit_supplier',
      'view_supplier_invoices', 'create_supplier_invoice', 'edit_supplier_invoice',
      'view_expense_reports', 'create_expense_report', 'edit_expense_report',
      // Comptabilité (gestion courante)
      'view_accounting', 'create_ecriture', 'edit_ecriture', 'open_exercice', 'view_accounting_reports',
    ],
  },

  {
    code: 'huissier',
    name: 'Huissier',
    description: 'Accès aux documents juridiques et significations',
    isSystemRole: true,
    permissions: [
      // Dossiers
      'view_dossiers',
      // Audiences
      'view_audiences', 'export_audience',
      // Factures (lecture)
      'view_factures', 'download_facture', 'print_facture',
      // Documents
      'view_documents', 'upload_document', 'edit_document', 'sign_document', 'share_document',
      'archive_document', 'download_document', 'restore_document',
      // Agenda
      'view_agenda',
      // Diligences
      'view_diligences', 'view_diligence_findings', 'download_diligence_report',
      'attach_document_to_diligence',
      // Communications
      'view_messages', 'send_message',
      // Paie personnelle
      'view_payroll', 'view_own_payslip', 'download_payslip',
      // Dépenses (lecture)
      'view_expenses', 'view_expense_reports',
    ],
  },

  {
    code: 'stagiaire',
    name: 'Stagiaire',
    description: 'Accès en lecture et contribution limitée',
    isSystemRole: true,
    permissions: [
      // Dossiers (lecture)
      'view_dossiers',
      // Audiences (lecture)
      'view_audiences', 'export_audience',
      // Documents
      'view_documents', 'upload_document',
      // Agenda
      'view_agenda',
      // Diligences (contribution limitée)
      'view_diligences', 'view_diligence_findings', 'create_diligence_finding',
      'add_diligence_note', 'download_diligence_report',
      // Communications
      'view_messages', 'send_message',
      // Paie personnelle
      'view_payroll', 'view_own_payslip', 'download_payslip',
    ],
  },

  {
    code: 'client',
    name: 'Client',
    description: 'Accès limité à ses propres informations',
    isSystemRole: true,
    permissions: [
      // Dossiers (lecture propres dossiers)
      'view_dossiers',
      // Factures
      'view_factures', 'download_facture', 'print_facture',
      // Audiences
      'export_audience',
      // Documents
      'view_documents', 'sign_document', 'download_document',
      // Agenda
      'view_agenda',
      // Diligences (consultation)
      'view_diligences', 'view_diligence_findings', 'download_diligence_report',
      // Communications
      'view_messages', 'send_message',
      // Apporteurs (consultation)
      'view_referral_commissions',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const SECURITY_REQUIRED_PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  admin: [
    'manage_procedure_templates',
    'apply_procedure_transition',
    'approve_procedure_requirement',
  ],
  avocat: [
    'apply_procedure_transition',
    'approve_procedure_requirement',
  ],
};

@Injectable()
export class RoleSeeder {
  private readonly logger = new Logger(RoleSeeder.name);

  constructor(
    @InjectRepository(UserRole)
    private readonly roleRepo: Repository<UserRole>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
  ) {}

  async seed() {
    this.logger.log('Seeding roles & role-permissions...');

    for (const config of ROLES_CONFIG) {
      // 1. Créer le rôle s'il n'existe pas (recherche exacte par tenant)
      let role = await findOneForTenant(this.roleRepo, 'code', config.code);
      const isNew = !role;

      if (isNew) {
        role = await this.roleRepo.save(
          this.roleRepo.create({
            code: config.code,
            name: config.name,
            description: config.description,
            isSystemRole: config.isSystemRole,
            status: 1,
          }),
        );
        this.logger.log(`Rôle créé : ${config.code}`);
      }

      // 2. N'assigner les permissions par défaut QUE pour les nouveaux rôles.
      //    Pour les rôles existants, les modifications manuelles (via l'UI) sont
      //    la source de vérité — on ne les écrase jamais au redémarrage.
      if (
        !isNew &&
        !(SECURITY_REQUIRED_PERMISSIONS_BY_ROLE[config.code]?.length)
      ) {
        this.logger.log(`Rôle "${config.code}" : déjà existant, permissions non modifiées.`);
        continue;
      }

      // 3. Récupérer les permissions du tenant courant (QueryBuilder exact)
      const permissionCodes = isNew
        ? config.permissions
        : SECURITY_REQUIRED_PERMISSIONS_BY_ROLE[config.code];
      const qb = this.permissionRepo.createQueryBuilder('p')
        .where('p.code IN (:...codes)', { codes: permissionCodes });
      if (hasActiveTenant()) {
        qb.andWhere('p.tenant_id = :tid', { tid: getCurrentTenantId() });
      }
      const permissions = await qb.getMany();

      const foundCodes = permissions.map((p) => p.code);
      const missingCodes = permissionCodes.filter(
        (code) => !foundCodes.includes(code),
      );
      if (missingCodes.length) {
        this.logger.warn(
          `Rôle "${config.code}" — permissions introuvables en DB : ${missingCodes.join(', ')}`,
        );
      }

      // 4. Assigner les permissions par défaut au nouveau rôle
      for (const permission of permissions) {
        const existing = await this.rolePermissionRepo.findOne({
          where: {
            role_id: role!.id,
            permission_id: permission.id,
          },
        });
        if (!existing) {
          await this.rolePermissionRepo.save(
            this.rolePermissionRepo.create({
              role_id: role!.id,
              permission_id: permission.id,
              status: 1,
            }),
          );
        }
      }

      this.logger.log(
        `Rôle "${config.code}" (nouveau) : ${permissions.length} permissions assignées par défaut.`,
      );
    }

    this.logger.log('Seeding rôles terminé.');
  }
}
