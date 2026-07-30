import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { UsersService } from 'src/modules/iam/user/user.service';
import { WritePlan } from './dto/analysis-response.dto';

type AiDatabaseOperation = 'READ' | 'INSERT' | 'UPDATE' | 'DELETE';

type AiPermissionMap = Partial<Record<AiDatabaseOperation, string>>;

export interface AiUserContext {
  id?: number | string;
  userId?: number | string;
  role?: string;
  permissions?: string[];
}

type AiUserLike = AiUserContext | string | number | undefined | null;

const SUPER_ADMIN = 'SUPER_ADMIN';

/**
 * Tables contenant des secrets, des identites, des journaux probatoires ou
 * l'infrastructure interne de l'assistant. Elles ne sont jamais exposees a une
 * requete SQL generee par l'IA, y compris pour un administrateur.
 */
const AI_DENIED_TABLES = new Set([
  'user',
  'users',
  'user_role',
  'user_role_assignment',
  'role_permission',
  'permission',
  'auth_tokens',
  'otp_codes',
  'otp_online_link',
  'audit_events',
  'audit_chain_heads',
  'outbox_events',
  'outbox_delivery_attempts',
  'activities_user',
  'conversations_bot',
  'conversation_messages',
  'ai_request_log',
]);

const AI_DENIED_COLUMN_PATTERN =
  /\b(?:password(?:_hash)?|refresh_?token|access_?token|fcm_?token|mfa_?secret|otp(?:_code|_secret)?|api_?key|private_?key|secret|token)\b/i;

const AI_TABLE_PERMISSIONS: Record<string, AiPermissionMap> = {
  // Dossiers
  dossiers: {
    READ: 'view_dossiers',
    INSERT: 'create_dossier',
    UPDATE: 'edit_dossier',
    DELETE: 'delete_dossier',
  },

  // Clients
  customer: {
    READ: 'view_clients',
    INSERT: 'create_client',
    UPDATE: 'edit_client',
    DELETE: 'delete_client',
  },
  type_customer: {
    READ: 'GET_TYPE_CUSTOMER',
    INSERT: 'CREATE_TYPE_CUSTOMER',
    UPDATE: 'UPDATE_TYPE_CUSTOMER',
    DELETE: 'UPDATE_TYPE_CUSTOMER',
  },

  // Audiences / agenda
  audiences: {
    READ: 'view_audiences',
    INSERT: 'create_audience',
    UPDATE: 'edit_audience',
    DELETE: 'delete_audience',
  },
  audience_types: {
    READ: 'MANAGE_AUDIENCE_TYPES',
    INSERT: 'MANAGE_AUDIENCE_TYPES',
    UPDATE: 'MANAGE_AUDIENCE_TYPES',
    DELETE: 'MANAGE_AUDIENCE_TYPES',
  },

  // Facturation / paiements
  factures: {
    READ: 'view_factures',
    INSERT: 'create_facture',
    UPDATE: 'edit_facture',
    DELETE: 'delete_facture',
  },
  paiements: {
    READ: 'manage_payments',
    INSERT: 'create_paiement',
    UPDATE: 'edit_paiement',
    DELETE: 'delete_paiement',
  },
  invoice_types: {
    READ: 'MANAGE_INVOICE_TYPES',
    INSERT: 'MANAGE_INVOICE_TYPES',
    UPDATE: 'MANAGE_INVOICE_TYPES',
    DELETE: 'MANAGE_INVOICE_TYPES',
  },

  // Documents
  document_customer: {
    READ: 'view_documents',
    INSERT: 'upload_document',
    UPDATE: 'edit_document',
    DELETE: 'delete_document',
  },
  document_type: {
    READ: 'VIEW_DOCUMENT_TYPE',
    INSERT: 'CREATE_DOCUMENT_TYPE',
    UPDATE: 'EDIT_DOCUMENT_TYPE',
    DELETE: 'DELETE_DOCUMENT_TYPE',
  },
  document_categories: {
    READ: 'MANAGE_DOCUMENT_CATEGORIES',
    INSERT: 'MANAGE_DOCUMENT_CATEGORIES',
    UPDATE: 'MANAGE_DOCUMENT_CATEGORIES',
    DELETE: 'MANAGE_DOCUMENT_CATEGORIES',
  },

  // Diligences
  diligences: {
    READ: 'view_diligences',
    INSERT: 'create_diligence',
    UPDATE: 'edit_diligence',
    DELETE: 'delete_diligence',
  },
  findings: {
    READ: 'view_diligence_findings',
    INSERT: 'create_diligence_finding',
    UPDATE: 'edit_diligence_finding',
    DELETE: 'delete_diligence_finding',
  },

  // Procedure/workflow
  procedure_templates: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  procedure_types: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  procedure_instances: {
    READ: 'view_dossiers',
    INSERT: 'create_dossier',
    UPDATE: 'edit_dossier',
    DELETE: 'delete_dossier',
  },
  stages: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  stage_visits: {
    READ: 'view_dossiers',
    INSERT: 'edit_dossier',
    UPDATE: 'edit_dossier',
    DELETE: 'delete_dossier',
  },
  sub_stages: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  sub_stage_visits: {
    READ: 'view_dossiers',
    INSERT: 'edit_dossier',
    UPDATE: 'edit_dossier',
    DELETE: 'delete_dossier',
  },
  transitions: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  cycles: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  stage_configs: {
    READ: 'view_dossiers',
    INSERT: 'manage_settings',
    UPDATE: 'manage_settings',
    DELETE: 'manage_settings',
  },
  decisions: {
    READ: 'view_dossiers',
    INSERT: 'edit_dossier',
    UPDATE: 'edit_dossier',
    DELETE: 'delete_dossier',
  },
  tasks: {
    READ: 'view_diligences',
    INSERT: 'create_diligence',
    UPDATE: 'edit_diligence',
    DELETE: 'delete_diligence',
  },

  // Collaborateurs / organisation
  employee: {
    READ: 'view_users',
    INSERT: 'create_user',
    UPDATE: 'edit_user',
    DELETE: 'delete_user',
  },
  branch: {
    READ: 'MANAGE_LOCATION',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'DELETE_BRANCH',
  },
  jurisdictions: {
    READ: 'MANAGE_JURISDICTIONS',
    INSERT: 'MANAGE_JURISDICTIONS',
    UPDATE: 'MANAGE_JURISDICTIONS',
    DELETE: 'MANAGE_JURISDICTIONS',
  },

  // Localisation
  country: {
    READ: 'MANAGE_LOCATION',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  region: {
    READ: 'MANAGE_LOCATION',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  division: {
    READ: 'MANAGE_LOCATION',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  district: {
    READ: 'MANAGE_LOCATION',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  location_city: {
    READ: 'MANAGE_LOCATION',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },

  // Apporteurs
  referrer: {
    READ: 'view_referrers',
    INSERT: 'create_referrer',
    UPDATE: 'edit_referrer',
    DELETE: 'delete_referrer',
  },
  dossier_referral: {
    READ: 'view_dossier_referrals',
    INSERT: 'create_dossier_referral',
    UPDATE: 'edit_dossier_referral',
    DELETE: 'delete_dossier_referral',
  },
  referral_commission: {
    READ: 'view_referral_commissions',
    INSERT: 'create_referral_commission',
    UPDATE: 'edit_referral_commission',
    DELETE: 'edit_referral_commission',
  },

  // Fournisseurs / depenses
  supplier: {
    READ: 'view_suppliers',
    INSERT: 'create_supplier',
    UPDATE: 'edit_supplier',
    DELETE: 'delete_supplier',
  },
  supplier_invoice: {
    READ: 'view_supplier_invoices',
    INSERT: 'create_supplier_invoice',
    UPDATE: 'edit_supplier_invoice',
    DELETE: 'delete_supplier_invoice',
  },
  expense_report: {
    READ: 'view_expense_reports',
    INSERT: 'create_expense_report',
    UPDATE: 'edit_expense_report',
    DELETE: 'delete_expense_report',
  },
  expense_line: {
    READ: 'view_expenses',
    INSERT: 'MANAGE_EXPENSES',
    UPDATE: 'MANAGE_EXPENSES',
    DELETE: 'MANAGE_EXPENSES',
  },

  // Paie
  payroll_period: {
    READ: 'view_payroll_periods',
    INSERT: 'create_payroll_period',
    UPDATE: 'edit_payroll_period',
    DELETE: 'MANAGE_PAYROLL',
  },
  payslip: {
    READ: 'view_payslips',
    INSERT: 'generate_payslip',
    UPDATE: 'edit_payslip',
    DELETE: 'MANAGE_PAYROLL',
  },
  payslip_line: {
    READ: 'view_payslips',
    INSERT: 'edit_payslip',
    UPDATE: 'edit_payslip',
    DELETE: 'edit_payslip',
  },
  payroll_contribution: {
    READ: 'view_payroll',
    INSERT: 'MANAGE_PAYROLL',
    UPDATE: 'MANAGE_PAYROLL',
    DELETE: 'MANAGE_PAYROLL',
  },
  salary_advance: {
    READ: 'view_payroll',
    INSERT: 'MANAGE_PAYROLL',
    UPDATE: 'MANAGE_PAYROLL',
    DELETE: 'MANAGE_PAYROLL',
  },

  // Comptabilite
  comptes_comptables: {
    READ: 'view_accounting',
    INSERT: 'manage_chart_of_accounts',
    UPDATE: 'manage_chart_of_accounts',
    DELETE: 'manage_chart_of_accounts',
  },
  journaux_comptables: {
    READ: 'view_accounting',
    INSERT: 'manage_chart_of_accounts',
    UPDATE: 'manage_chart_of_accounts',
    DELETE: 'manage_chart_of_accounts',
  },
  exercices_comptables: {
    READ: 'view_accounting',
    INSERT: 'open_exercice',
    UPDATE: 'open_exercice',
    DELETE: 'close_exercice',
  },
  ecritures_comptables: {
    READ: 'view_accounting',
    INSERT: 'create_ecriture',
    UPDATE: 'edit_ecriture',
    DELETE: 'delete_ecriture',
  },
  lignes_ecriture_comptable: {
    READ: 'view_accounting',
    INSERT: 'create_ecriture',
    UPDATE: 'edit_ecriture',
    DELETE: 'delete_ecriture',
  },

  // IAM: volontairement tres restrictif via IA
  user: {
    READ: 'view_users',
    INSERT: 'create_user',
    UPDATE: 'edit_user',
    DELETE: 'delete_user',
  },
  user_role: {
    READ: 'manage_roles',
    INSERT: 'manage_roles',
    UPDATE: 'manage_roles',
    DELETE: 'manage_roles',
  },
  user_role_assignment: {
    READ: 'manage_roles',
    INSERT: 'manage_roles',
    UPDATE: 'manage_roles',
    DELETE: 'manage_roles',
  },
  role_permission: {
    READ: 'manage_roles',
    INSERT: 'manage_roles',
    UPDATE: 'manage_roles',
    DELETE: 'manage_roles',
  },
  permission: {
    READ: 'manage_roles',
    INSERT: 'manage_roles',
    UPDATE: 'manage_roles',
    DELETE: 'manage_roles',
  },
};

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'cross',
  'on', 'as', 'and', 'or', 'group', 'order', 'by', 'having', 'limit', 'offset',
  'union', 'all', 'distinct', 'case', 'when', 'then', 'else', 'end',
]);

@Injectable()
export class AiDatabasePermissionService {
  private readonly logger = new Logger(AiDatabasePermissionService.name);

  constructor(
    private readonly usersService: UsersService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async assertCanReadTables(user: AiUserLike, tables: string[]): Promise<void> {
    const tableNames = this.normalizeTables(tables);
    await this.assertAllowed(user, tableNames.map((table) => ({ table, operation: 'READ' as const })));
  }

  async assertCanReadSql(user: AiUserLike, sqlQuery: string): Promise<void> {
    const inspectableSql = this.cleanSqlForInspection(sqlQuery);
    const sensitiveColumn = inspectableSql.match(AI_DENIED_COLUMN_PATTERN)?.[0];
    if (sensitiveColumn) {
      this.logger.warn(
        `Acces IA refuse: user=${this.getUserDebugId(user)} | colonne sensible ${sensitiveColumn}`,
      );
      throw new ForbiddenException(
        'Cette demande IA vise une donnee authentification ou un secret.',
      );
    }

    const tables = this.extractTablesFromSql(sqlQuery);
    await this.assertCanReadTables(user, tables);
  }

  async assertCanWritePlan(user: AiUserLike, writePlan: WritePlan): Promise<void> {
    const requirements = (writePlan.operations ?? []).map((operation) => ({
      table: operation.entity,
      operation: operation.operation,
    }));

    await this.assertAllowed(user, requirements);
  }

  extractTablesFromSql(sqlQuery: string): string[] {
    const tables = new Set<string>();
    const cleaned = this.cleanSqlForInspection(sqlQuery);

    const tableRegex = /\b(?:FROM|JOIN)\s+`?([a-zA-Z_][\w]*)`?(?:\s+`?[a-zA-Z_][\w]*`?)?/gi;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(cleaned)) !== null) {
      const table = match[1]?.toLowerCase();
      if (table && !SQL_KEYWORDS.has(table)) tables.add(table);
    }

    return Array.from(tables);
  }

  filterAllowedTables(tables: string[]): string[] {
    return this.normalizeTables(tables)
      .filter((table) => !AI_DENIED_TABLES.has(table));
  }

  isTableAllowed(table: string): boolean {
    const normalized = this.normalizeTableName(table);
    return !!normalized && !AI_DENIED_TABLES.has(normalized);
  }

  isColumnAllowed(column: string): boolean {
    const normalized = String(column ?? '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
    return !!normalized && !AI_DENIED_COLUMN_PATTERN.test(normalized);
  }

  private async assertAllowed(
    user: AiUserLike,
    requirements: Array<{ table: string; operation: AiDatabaseOperation }>,
  ): Promise<void> {
    const normalizedRequirements = this.normalizeRequirements(requirements);
    const denied = normalizedRequirements.filter(({ table }) => AI_DENIED_TABLES.has(table));
    if (denied.length > 0) {
      const tables = denied.map(({ table }) => table).join(', ');
      this.logger.warn(`Acces IA refuse: user=${this.getUserDebugId(user)} | tables protegees ${tables}`);
      throw new ForbiddenException(
        'Cette demande IA vise une table interne ou une donnee authentification.',
      );
    }

    if (this.isAdmin(user)) return;

    const permissions = await this.getUserPermissionCodes(user);
    if (permissions.has(SUPER_ADMIN)) return;

    const missing = normalizedRequirements
      .map((requirement) => {
        const permission = this.resolvePermission(requirement.table, requirement.operation);
        return { ...requirement, permission };
      })
      .filter((requirement) => !requirement.permission || !permissions.has(requirement.permission));

    if (missing.length === 0) return;

    const details = missing
      .map((item) => item.permission
        ? `${item.operation} ${item.table} -> ${item.permission}`
        : `${item.operation} ${item.table} -> permission non configuree`)
      .join(', ');

    this.logger.warn(`Acces IA refuse: user=${this.getUserDebugId(user)} | ${details}`);
    throw new ForbiddenException(
      'Vous n\'avez pas la permission necessaire pour cette demande IA.',
    );
  }

  private normalizeRequirements(
    requirements: Array<{ table: string; operation: AiDatabaseOperation }>,
  ): Array<{ table: string; operation: AiDatabaseOperation }> {
    const seen = new Set<string>();
    const normalized: Array<{ table: string; operation: AiDatabaseOperation }> = [];

    for (const requirement of requirements) {
      const table = this.normalizeTableName(requirement.table);
      if (!table) continue;
      const key = `${requirement.operation}:${table}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ table, operation: requirement.operation });
    }

    return normalized;
  }

  private normalizeTables(tables: string[]): string[] {
    return Array.from(new Set(
      (tables ?? [])
        .map((table) => this.normalizeTableName(table))
        .filter((table): table is string => !!table),
    ));
  }

  private normalizeTableName(table: string | undefined | null): string | null {
    if (!table || typeof table !== 'string') return null;
    return table.replace(/`/g, '').trim().toLowerCase();
  }

  private cleanSqlForInspection(sqlQuery: string): string {
    return String(sqlQuery ?? '')
      .replace(/--.*$/gm, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // Les valeurs litterales ne doivent pas provoquer de faux positif
      // ("document nomme token", par exemple). Les identifiants restent visibles.
      .replace(/'(?:''|\\.|[^'])*'/g, ' ');
  }

  private resolvePermission(table: string, operation: AiDatabaseOperation): string | null {
    const normalized = this.normalizeTableName(table);
    if (!normalized) return null;
    return AI_TABLE_PERMISSIONS[normalized]?.[operation] ?? null;
  }

  private isAdmin(user: AiUserLike): boolean {
    return typeof user === 'object' && user?.role === 'admin';
  }

  private async getUserPermissionCodes(user: AiUserLike): Promise<Set<string>> {
    if (typeof user === 'object' && Array.isArray(user?.permissions) && user.permissions.length > 0) {
      return new Set(user.permissions);
    }

    const userId = typeof user === 'string' || typeof user === 'number'
      ? Number(user)
      : Number(user?.userId ?? user?.id);
    if (!Number.isFinite(userId)) return new Set();

    try {
      const permissions = await this.usersService.getUserPermissions(userId);
      return new Set((permissions ?? []).map((permission: any) => permission.code));
    } catch (error: any) {
      this.logger.warn(`Impossible de charger les permissions IAM pour user=${userId}: ${error?.message ?? error}`);
      return new Set();
    }
  }

  private getUserDebugId(user: AiUserLike): string {
    if (typeof user === 'string' || typeof user === 'number') return String(user);
    return String(user?.id ?? user?.userId ?? '?');
  }

  async assertTablesExistInPolicy(tables: string[]): Promise<void> {
    const knownTables = new Set(
      this.dataSource.entityMetadatas.map((metadata) => metadata.tableName.toLowerCase()),
    );

    const unknown = this.normalizeTables(tables)
      .filter((table) => knownTables.has(table))
      .filter((table) => !AI_TABLE_PERMISSIONS[table]);

    if (unknown.length > 0) {
      this.logger.warn(`Tables TypeORM sans policy IA: ${unknown.join(', ')}`);
    }
  }
}
