import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { UsersService } from 'src/modules/iam/user/user.service';
import { getCurrentTenantId, hasActiveTenant } from '../tenant/tenant.context';
import {
  AccessProfile,
  AI_RESTRICTED_COLUMNS,
  buildPermissionRefusal,
} from './ai-access-policy';
import { pruneDeniedJoins } from './denied-join-pruning';
import { WritePlan } from './dto/analysis-response.dto';
import { AiActionRegistry } from './write/ai-action.registry';

type AiDatabaseOperation = 'READ' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ACTION';

/** Droit exigé pour une opération ; `permission` l'impose (actions métier). */
type AiRequirement = { table: string; operation: AiDatabaseOperation; permission?: string };

type AiPermissionMap = Partial<Record<AiDatabaseOperation, string>>;

export interface AiUserContext {
  id?: number | string;
  userId?: number | string;
  role?: string;
  permissions?: string[];
}

type AiUserLike = AiUserContext | string | number | undefined | null;

const SUPER_ADMIN = 'SUPER_ADMIN';
const PERMISSION_CACHE_TTL_MS = 10_000;

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
    READ: 'view_factures',
    INSERT: 'manage_invoice_settings',
    UPDATE: 'manage_invoice_settings',
    DELETE: 'manage_invoice_settings',
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

  // Traitement orienté actions — catalogue (manage_action_catalog) + instances (create/update_dossier_action)
  case_action_families: {
    READ: 'view_dossier_actions',
    INSERT: 'manage_action_catalog',
    UPDATE: 'manage_action_catalog',
  },
  case_action_definitions: {
    READ: 'view_dossier_actions',
    INSERT: 'manage_action_catalog',
    UPDATE: 'manage_action_catalog',
  },
  dossier_actions: {
    READ: 'view_dossier_actions',
    INSERT: 'create_dossier_action',
    UPDATE: 'update_dossier_action',
  },
  dossier_action_document_links: { READ: 'view_dossier_actions' },
  dossier_action_audience_links: { READ: 'view_dossier_actions' },
  dossier_action_relations: { READ: 'view_dossier_actions' },
  case_recommendation_rules: {
    READ: 'view_dossier_actions',
    INSERT: 'manage_action_catalog',
    UPDATE: 'manage_action_catalog',
  },
  dossier_recommendations: { READ: 'view_dossier_actions' },

  // Facturation issue du parcours d'actions (lecture uniquement via l'IA)
  dossier_billing_profiles: { READ: 'view_billable_items' },
  dossier_billing_rules: { READ: 'view_billable_items' },
  billable_items: { READ: 'view_billable_items' },
  invoice_lines: { READ: 'view_factures' },

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
    READ: 'view_dossiers',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'DELETE_BRANCH',
  },
  jurisdictions: {
    READ: 'view_dossiers',
    INSERT: 'MANAGE_JURISDICTIONS',
    UPDATE: 'MANAGE_JURISDICTIONS',
    DELETE: 'MANAGE_JURISDICTIONS',
  },

  // Localisation
  country: {
    READ: 'view_dossiers',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  region: {
    READ: 'view_dossiers',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  division: {
    READ: 'view_dossiers',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  district: {
    READ: 'view_dossiers',
    INSERT: 'MANAGE_LOCATION',
    UPDATE: 'MANAGE_LOCATION',
    DELETE: 'MANAGE_LOCATION',
  },
  location_city: {
    READ: 'view_dossiers',
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
  expense_category: {
    READ: 'view_expenses',
    INSERT: 'create_expense_report',
    UPDATE: 'edit_expense_report',
    DELETE: 'edit_expense_report',
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
  'select',
  'from',
  'where',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'cross',
  'on',
  'as',
  'and',
  'or',
  'group',
  'order',
  'by',
  'having',
  'limit',
  'offset',
  'union',
  'all',
  'distinct',
  'case',
  'when',
  'then',
  'else',
  'end',
]);

@Injectable()
export class AiDatabasePermissionService {
  private readonly logger = new Logger(AiDatabasePermissionService.name);
  private readonly permissionCache = new Map<
    string,
    { codes: Set<string>; at: number }
  >();

  constructor(
    private readonly usersService: UsersService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional() private readonly actions?: AiActionRegistry,
  ) {}

  async assertCanReadTables(user: AiUserLike, tables: string[]): Promise<void> {
    const tableNames = this.normalizeTables(tables);
    await this.assertAllowed(
      user,
      tableNames.map((table) => ({ table, operation: 'READ' as const })),
    );
  }

  /**
   * Sépare les tables candidates (détection par mots-clés, volontairement
   * large) entre celles que l'utilisateur peut lire et les autres. Sert à
   * retirer du schéma envoyé à l'IA les tables hors de ses droits, au lieu de
   * refuser toute la demande parce qu'une table voisine a été détectée.
   */
  async partitionReadableTables(
    user: AiUserLike,
    tables: string[],
  ): Promise<{ allowed: string[]; denied: string[] }> {
    const tableNames = this.normalizeTables(tables);
    const missing = await this.findMissing(
      user,
      tableNames.map((table) => ({ table, operation: 'READ' as const })),
    );
    const denied = new Set(missing.map((item) => item.table));
    return {
      allowed: tables.filter(
        (table) => !denied.has(this.normalizeTableName(table) ?? ''),
      ),
      denied: Array.from(denied),
    };
  }

  /** Droit de lecture exigé pour une table (null : table fermée à l'IA). */
  getReadPermission(table: string): string | null {
    return this.resolvePermission(table, 'READ');
  }

  async assertCanReadSql(user: AiUserLike, sqlQuery: string): Promise<void> {
    const tables = this.extractTablesFromSql(sqlQuery);
    await this.assertCanReadTables(user, tables);

    // Colonnes financières de tables par ailleurs lisibles (budget d'un
    // dossier, salaire d'un collaborateur…) citées explicitement.
    const hidden = await this.getHiddenColumns(user, tables);
    if (!hidden.size) return;
    const cleaned = this.stripSqlLiterals(sqlQuery).toLowerCase();
    const missing = new Set<string>();
    for (const [table, columns] of hidden) {
      for (const column of columns) {
        if (new RegExp(`\\b${column}\\b`).test(cleaned)) {
          for (const code of AI_RESTRICTED_COLUMNS[table]?.[column] ?? []) {
            missing.add(code);
          }
        }
      }
    }
    if (!missing.size) return;
    this.logger.warn(
      `Acces IA refuse (colonnes): user=${this.getUserDebugId(user)} | ${Array.from(missing).join(', ')}`,
    );
    throw new ForbiddenException(buildPermissionRefusal(Array.from(missing)));
  }

  /**
   * Retire les jointures d'enrichissement vers les tables que l'utilisateur ne
   * peut pas lire (ex. le nom du responsable d'une action, qui joint `user`) :
   * la question reste répondable sans ces colonnes, au lieu d'être refusée en
   * entier. Renvoie le SQL d'origine quand rien ne peut être retiré sans changer
   * le résultat : le refus habituel (assertCanReadSql) s'applique alors.
   */
  async pruneUnreadableJoins(user: AiUserLike, sqlQuery: string): Promise<string> {
    const tables = this.extractTablesFromSql(sqlQuery);
    if (!tables.length) return sqlQuery;
    const missing = await this.findMissing(
      user,
      tables.map((table) => ({ table, operation: 'READ' as const })),
    );
    if (!missing.length) return sqlQuery;

    const denied = Array.from(new Set(missing.map((item) => item.table)));
    const pruned = pruneDeniedJoins(sqlQuery, denied);
    if (!pruned) return sqlQuery;
    if (this.extractTablesFromSql(pruned).some((table) => denied.includes(table))) {
      return sqlQuery;
    }
    this.logger.log(
      `Acces IA: jointure retiree faute de droit de lecture (user=${this.getUserDebugId(user)} | ${denied.join(', ')})`,
    );
    return pruned;
  }

  /**
   * Colonnes financières à masquer pour l'utilisateur, par table (voir
   * AI_RESTRICTED_COLUMNS) : retirées du schéma envoyé au modèle et des
   * lignes renvoyées par un `SELECT *`.
   */
  async getHiddenColumns(
    user: AiUserLike,
    tables: string[],
  ): Promise<Map<string, string[]>> {
    const hidden = new Map<string, string[]>();
    const concerned = this.normalizeTables(tables).filter(
      (table) => AI_RESTRICTED_COLUMNS[table],
    );
    if (!concerned.length || this.isAdmin(user)) return hidden;
    const permissions = await this.getUserPermissionCodes(user);
    if (permissions.has(SUPER_ADMIN)) return hidden;
    for (const table of concerned) {
      const columns = Object.entries(AI_RESTRICTED_COLUMNS[table])
        .filter(([, codes]) => !codes.some((code) => permissions.has(code)))
        .map(([column]) => column);
      if (columns.length) hidden.set(table, columns);
    }
    return hidden;
  }

  /** Retire des résultats les colonnes masquées (cas `SELECT *` / `t.*`). */
  async redactRows<T extends Record<string, any>>(
    user: AiUserLike,
    sqlQuery: string,
    rows: T[],
  ): Promise<T[]> {
    if (!Array.isArray(rows) || !rows.length) return rows;
    const hidden = await this.getHiddenColumns(
      user,
      this.extractTablesFromSql(sqlQuery),
    );
    if (!hidden.size) return rows;
    const columns = new Set(Array.from(hidden.values()).flat());
    return rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const copy: Record<string, any> = { ...row };
      for (const column of columns) delete copy[column];
      return copy as T;
    });
  }

  /**
   * Droits réels de l'utilisateur (libellés du cabinet) et nom de son rôle,
   * pour répondre aux questions « que puis-je faire ? ».
   */
  async getAccessProfile(user: AiUserLike): Promise<AccessProfile> {
    const userId =
      typeof user === 'string' || typeof user === 'number'
        ? Number(user)
        : Number(user?.userId ?? user?.id);
    let roleName: string | null = null;
    const permissions = new Map<string, string>();
    if (Number.isFinite(userId)) {
      try {
        const profile: any = await this.usersService.findOne(userId);
        roleName = profile?.role_name ?? profile?.role ?? null;
        const list = await this.usersService.getUserPermissions(userId);
        for (const permission of list ?? []) {
          const code = permission?.code ?? permission;
          if (typeof code === 'string') {
            permissions.set(code, permission?.description ?? '');
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `Profil d'accès IA indisponible pour user=${userId}: ${error?.message ?? error}`,
        );
      }
    }
    if (!permissions.size) {
      for (const code of await this.getUserPermissionCodes(user)) {
        permissions.set(code, '');
      }
    }
    return {
      isAdmin: this.isAdmin(user) || permissions.has(SUPER_ADMIN),
      roleName,
      permissions,
    };
  }

  async assertCanWritePlan(
    user: AiUserLike,
    writePlan: WritePlan,
  ): Promise<void> {
    const requirements = (writePlan.operations ?? []).map((operation): AiRequirement => {
      if (operation.operation !== 'ACTION') {
        return { table: operation.entity, operation: operation.operation };
      }
      // Action métier : la permission du bouton correspondant de l'écran manuel.
      const handler = this.actions?.get(operation.action);
      if (!handler) {
        throw new BadRequestException(`Action inconnue : « ${operation.action ?? '?'} ».`);
      }
      return {
        table: handler.definition.entity,
        operation: 'ACTION',
        permission: handler.definition.permission,
      };
    });

    await this.assertAllowed(user, requirements);
  }

  extractTablesFromSql(sqlQuery: string): string[] {
    const tables = new Set<string>();
    const cleaned = this.stripSqlLiterals(sqlQuery);

    // Segment qui suit FROM/JOIN jusqu'au mot-clé suivant : couvre les listes
    // séparées par des virgules (« FROM dossiers d, factures f ») et les noms
    // qualifiés (« kabysoft.factures »), qui échappaient au contrôle.
    const segmentRegex =
      /\b(?:FROM|JOIN)\s+([^;()]*?)(?=\b(?:WHERE|GROUP|ORDER|LIMIT|HAVING|UNION|ON|USING|LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL|STRAIGHT_JOIN|JOIN|WINDOW|FOR|LOCK|INTO)\b|[;()]|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = segmentRegex.exec(cleaned)) !== null) {
      for (const item of match[1].split(',')) {
        const name =
          /^\s*`?([a-zA-Z_]\w*)`?(?:\s*\.\s*`?([a-zA-Z_]\w*)`?)?/.exec(item);
        const table = (name?.[2] ?? name?.[1])?.toLowerCase();
        if (table && !SQL_KEYWORDS.has(table)) tables.add(table);
      }
    }

    return Array.from(tables);
  }

  private stripSqlLiterals(sqlQuery: string): string {
    return String(sqlQuery ?? '')
      .replace(/--.*$/gm, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  }

  private async findMissing(
    user: AiUserLike,
    requirements: AiRequirement[],
  ): Promise<
    Array<{
      table: string;
      operation: AiDatabaseOperation;
      permission: string | null;
    }>
  > {
    if (this.isAdmin(user)) return [];

    const permissions = await this.getUserPermissionCodes(user);
    if (permissions.has(SUPER_ADMIN)) return [];

    return this.normalizeRequirements(requirements)
      .map((requirement) => {
        const permission =
          requirement.permission ??
          this.resolvePermission(requirement.table, requirement.operation);
        return { ...requirement, permission };
      })
      .filter(
        (requirement) =>
          !requirement.permission || !permissions.has(requirement.permission),
      );
  }

  private async assertAllowed(
    user: AiUserLike,
    requirements: AiRequirement[],
  ): Promise<void> {
    const missing = await this.findMissing(user, requirements);
    if (missing.length === 0) return;

    const details = missing
      .map((item) =>
        item.permission
          ? `${item.operation} ${item.table} -> ${item.permission}`
          : `${item.operation} ${item.table} -> permission non configuree`,
      )
      .join(', ');

    this.logger.warn(
      `Acces IA refuse: user=${this.getUserDebugId(user)} | ${details}`,
    );
    throw new ForbiddenException(
      buildPermissionRefusal(
        Array.from(
          new Set(
            missing
              .map((item) => item.permission)
              .filter((code): code is string => !!code),
          ),
        ),
      ),
    );
  }

  private normalizeRequirements(requirements: AiRequirement[]): AiRequirement[] {
    const seen = new Set<string>();
    const normalized: AiRequirement[] = [];

    for (const requirement of requirements) {
      const table = this.normalizeTableName(requirement.table);
      if (!table) continue;
      const key = `${requirement.operation}:${table}:${requirement.permission ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({ ...requirement, table });
    }

    return normalized;
  }

  private normalizeTables(tables: string[]): string[] {
    return Array.from(
      new Set(
        (tables ?? [])
          .map((table) => this.normalizeTableName(table))
          .filter((table): table is string => !!table),
      ),
    );
  }

  private normalizeTableName(table: string | undefined | null): string | null {
    if (!table || typeof table !== 'string') return null;
    return table.replace(/`/g, '').trim().toLowerCase();
  }

  private resolvePermission(
    table: string,
    operation: AiDatabaseOperation,
  ): string | null {
    const normalized = this.normalizeTableName(table);
    if (!normalized) return null;
    return AI_TABLE_PERMISSIONS[normalized]?.[operation] ?? null;
  }

  private isAdmin(user: AiUserLike): boolean {
    return typeof user === 'object' && user?.role === 'admin';
  }

  private async getUserPermissionCodes(user: AiUserLike): Promise<Set<string>> {
    const jwtPermissions =
      typeof user === 'object' &&
      Array.isArray(user?.permissions) &&
      user.permissions.length > 0
        ? new Set(user.permissions)
        : null;

    // Source de vérité = DB (les modifs faites dans Paramètres > Rôles doivent
    // s'appliquer sans obliger l'utilisateur à se reconnecter). Le JWT ne sert
    // que de fallback si la DB est inaccessible.
    const userId =
      typeof user === 'string' || typeof user === 'number'
        ? Number(user)
        : Number(user?.userId ?? user?.id);
    if (Number.isFinite(userId)) {
      // Une demande IA contrôle les droits à plusieurs étapes : cache très
      // court pour ne pas recharger le rôle à chacune, sans retarder la prise
      // en compte d'une modification faite dans Paramètres > Rôles.
      const cacheKey = `${hasActiveTenant() ? getCurrentTenantId() : '-'}:${userId}`;
      const cached = this.permissionCache.get(cacheKey);
      if (cached && Date.now() - cached.at < PERMISSION_CACHE_TTL_MS) {
        return cached.codes;
      }
      try {
        const permissions = await this.usersService.getUserPermissions(userId);
        const codes = (permissions ?? []).map(
          (permission: any) => permission.code ?? permission,
        );
        if (codes.length > 0) {
          const set = new Set<string>(codes);
          this.permissionCache.set(cacheKey, { codes: set, at: Date.now() });
          return set;
        }
        // Rôle sans permission en DB : ne pas retomber sur un JWT périmé.
        if (jwtPermissions) {
          this.logger.warn(
            `Permissions DB vides pour user=${userId}, JWT ignoré (risque de stale)`,
          );
        }
        return new Set();
      } catch (error: any) {
        this.logger.warn(
          `Impossible de charger les permissions IAM pour user=${userId}: ${error?.message ?? error}`,
        );
        if (jwtPermissions) return jwtPermissions;
        return new Set();
      }
    }

    return jwtPermissions ?? new Set();
  }

  private getUserDebugId(user: AiUserLike): string {
    if (typeof user === 'string' || typeof user === 'number')
      return String(user);
    return String(user?.id ?? user?.userId ?? '?');
  }

  async assertTablesExistInPolicy(tables: string[]): Promise<void> {
    const knownTables = new Set(
      this.dataSource.entityMetadatas.map((metadata) =>
        metadata.tableName.toLowerCase(),
      ),
    );

    const unknown = this.normalizeTables(tables)
      .filter((table) => knownTables.has(table))
      .filter((table) => !AI_TABLE_PERMISSIONS[table]);

    if (unknown.length > 0) {
      this.logger.warn(`Tables TypeORM sans policy IA: ${unknown.join(', ')}`);
    }
  }
}
