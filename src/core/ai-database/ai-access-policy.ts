import { PERMISSION_DEFINITIONS } from 'src/core/auth/seeders/permission.seeder';

/**
 * Politique d'accès de l'assistant IA aux domaines sensibles du cabinet
 * (finances, comptabilité, paie, dépenses…) : tables et colonnes concernées,
 * reconnaissance des questions qui les visent, et messages clairs quand le
 * rôle de l'utilisateur ne les autorise pas. Fonctions pures, sans accès DB.
 */

export interface RestrictedDomain {
  key: string;
  /** Complément de « consulter … » dans les messages. */
  label: string;
  tables: string[];
  /** Testé sur la question normalisée (minuscules, sans accents). */
  keywords: RegExp;
}

export const AI_RESTRICTED_DOMAINS: RestrictedDomain[] = [
  {
    key: 'invoicing',
    label: 'les factures et paiements',
    tables: ['factures', 'invoice_lines', 'paiements'],
    keywords:
      /\b(factur(e|es|ee|ees|er|ation)|paiements?|impaye(e|s|es)?|reglements?|encaisse\w*|chiffre d affaires|tresorerie|creances?|recettes?)\b/,
  },
  {
    key: 'billing',
    label: 'la facturation des dossiers (honoraires, tarifs, éléments facturables)',
    tables: ['billable_items', 'dossier_billing_profiles', 'dossier_billing_rules'],
    keywords: /\b(facturables?|tarifs?|tarification|honoraires?|bareme)\b/,
  },
  {
    key: 'accounting',
    label: 'la comptabilité',
    tables: [
      'comptes_comptables',
      'journaux_comptables',
      'exercices_comptables',
      'ecritures_comptables',
      'lignes_ecriture_comptable',
    ],
    keywords:
      /\b(comptab\w*|ecritures?|grand livre|plan comptable|exercices? comptables?|journa(l|ux) comptables?)\b/,
  },
  {
    key: 'payroll',
    label: 'la paie et les salaires',
    tables: [
      'payroll_period',
      'payslip',
      'payslip_line',
      'payroll_contribution',
      'salary_advance',
    ],
    keywords:
      /\b(paie|salaires?|salariales?|bulletins? de (paie|salaire)|fiches? de paie|avances? sur salaire|cotisations?|remunerations?)\b/,
  },
  {
    key: 'expenses',
    label: 'les dépenses et fournisseurs',
    tables: [
      'expense_report',
      'expense_line',
      'expense_category',
      'supplier',
      'supplier_invoice',
    ],
    keywords: /\b(depenses?|notes? de frais|fournisseurs?)\b/,
  },
  {
    key: 'commissions',
    label: 'les commissions des apporteurs',
    tables: ['referral_commission'],
    keywords: /\bcommissions?\b/,
  },
];

/**
 * Colonnes financières portées par des tables non financières : lisibles
 * seulement avec l'un des droits listés (en plus du droit de lecture de la
 * table). Ex. le budget d'honoraires d'un dossier n'est pas visible d'un
 * avocat sans droit sur les factures.
 */
export const AI_RESTRICTED_COLUMNS: Record<string, Record<string, string[]>> = {
  dossiers: {
    budget_estimate: ['view_factures'],
    procedure_costs: ['view_factures'],
    actual_costs: ['view_factures'],
  },
  case_action_definitions: {
    default_rate: ['view_billable_items'],
  },
  dossier_referral: {
    commission_rate: ['view_referral_commissions'],
    commission_amount: ['view_referral_commissions'],
  },
  employee: {
    salary: ['view_payroll'],
    hourly_rate: ['view_payroll', 'view_billable_items'],
  },
};

const PERMISSION_LABELS = new Map(
  PERMISSION_DEFINITIONS.map((definition) => [
    definition.code,
    definition.description,
  ]),
);

export function permissionLabel(code: string, fallback?: string): string {
  return fallback?.trim() || PERMISSION_LABELS.get(code) || code;
}

export function normalizeAccessText(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Domaines sensibles explicitement visés par la question. */
export function matchRestrictedDomains(question: string): RestrictedDomain[] {
  const normalized = normalizeAccessText(question);
  return AI_RESTRICTED_DOMAINS.filter((domain) =>
    domain.keywords.test(normalized),
  );
}

export function joinFr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

const ADMIN_HINT =
  "Si vous avez besoin de cet accès, adressez-vous à l'administrateur du cabinet (Paramètres › Rôles).";

export function buildDomainRefusal(
  domains: RestrictedDomain[],
  roleName?: string | null,
): string {
  const role = roleName ? ` (**${roleName}**)` : '';
  return `🔒 **Accès non autorisé** — votre rôle${role} ne vous permet pas de consulter ${joinFr(
    domains.map((domain) => domain.label),
  )}.\n\nJe ne peux donc pas répondre à cette demande. ${ADMIN_HINT}`;
}

export function buildTableRefusal(
  items: Array<{ label: string; permission: string | null }>,
  roleName?: string | null,
): string {
  const role = roleName ? ` (**${roleName}**)` : '';
  const labels = items.map((item) => `**${item.label}**`).join(', ');
  const rights = Array.from(
    new Set(items.map((item) => item.permission).filter((code): code is string => !!code)),
  ).map((code) => `« ${permissionLabel(code)} »`);
  const required = rights.length
    ? ` (${rights.length > 1 ? 'droits requis' : 'droit requis'} : ${joinFr(rights)})`
    : '';
  return `🔒 **Accès non autorisé** — votre rôle${role} ne vous permet pas de consulter : ${labels}${required}.\n\nJe ne peux donc pas répondre à cette demande. ${ADMIN_HINT}`;
}

export function buildPermissionRefusal(missingPermissions: string[]): string {
  const labels = missingPermissions.map((code) => `« ${permissionLabel(code)} »`);
  const rights = labels.length
    ? `votre rôle ne dispose pas ${labels.length > 1 ? 'des droits' : 'du droit'} ${joinFr(labels)}`
    : "ces données ne sont pas ouvertes à l'assistant IA";
  return `🔒 Accès non autorisé : ${rights}. Je ne peux pas consulter ou modifier ces informations pour vous. ${ADMIN_HINT}`;
}

/**
 * Retire du schéma texte (« ## table » puis une ligne « - colonne … » par
 * colonne) les colonnes masquées pour l'utilisateur.
 */
export function stripSchemaColumns(
  schema: string,
  hidden: Map<string, string[]>,
): string {
  if (!hidden.size) return schema;
  let currentTable = '';
  return schema
    .split('\n')
    .filter((line) => {
      const header = /^## (\S+)/.exec(line);
      if (header) {
        currentTable = header[1].toLowerCase();
        return true;
      }
      const column = /^- (\S+)/.exec(line);
      if (!column) return true;
      return !hidden.get(currentTable)?.includes(column[1].toLowerCase());
    })
    .join('\n');
}

// ── Questions sur les droits de l'utilisateur ───────────────────────────────

export interface CapabilityGroup {
  key: string;
  label: string;
  codes: string[];
  keywords?: RegExp;
  financial?: boolean;
}

export const AI_CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    key: 'dossiers',
    label: 'Dossiers',
    keywords: /\b(dossiers?|affaires?)\b/,
    codes: [
      'view_dossiers',
      'create_dossier',
      'edit_dossier',
      'delete_dossier',
      'assign_dossier',
      'view_dossier_confidential',
      'close_dossier',
      'reopen_dossier',
      'migrate_dossier_workflow',
      'view_dossier_actions',
      'create_dossier_action',
      'update_dossier_action',
      'manage_action_catalog',
    ],
  },
  {
    key: 'audiences',
    label: 'Audiences',
    keywords: /\baudiences?\b/,
    codes: [
      'view_audiences',
      'create_audience',
      'edit_audience',
      'delete_audience',
      'cancel_audience',
      'confirm_audience',
      'postpone_audience',
      'mark_audience_held',
      'export_audience',
    ],
  },
  {
    key: 'agenda',
    label: 'Agenda',
    keywords: /\b(agendas?|evenements?|rendez.vous)\b/,
    codes: [
      'view_agenda',
      'create_event',
      'edit_event',
      'delete_event',
      'view_all_agendas',
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    keywords: /\bclients?\b/,
    codes: [
      'view_clients',
      'create_client',
      'edit_client',
      'delete_client',
      'import_clients',
      'export_clients',
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    keywords: /\b(documents?|pieces?)\b/,
    codes: [
      'view_documents',
      'upload_document',
      'edit_document',
      'delete_document',
      'download_document',
      'share_document',
      'sign_document',
      'validate_document',
      'reject_document',
      'archive_document',
      'restore_document',
    ],
  },
  {
    key: 'diligences',
    label: 'Diligences',
    keywords: /\b(diligences?|constats?)\b/,
    codes: [
      'view_diligences',
      'create_diligence',
      'edit_diligence',
      'delete_diligence',
      'complete_diligence',
      'assign_diligence',
      'generate_diligence_report',
      'download_diligence_report',
      'view_diligence_findings',
      'create_diligence_finding',
      'edit_diligence_finding',
      'delete_diligence_finding',
      'attach_document_to_diligence',
      'add_diligence_note',
    ],
  },
  {
    key: 'invoicing',
    label: 'Factures et paiements',
    financial: true,
    keywords: AI_RESTRICTED_DOMAINS[0].keywords,
    codes: [
      'view_factures',
      'create_facture',
      'edit_facture',
      'delete_facture',
      'archive_facture',
      'print_facture',
      'email_facture',
      'download_facture',
      'manage_invoice_settings',
      'view_financial_reports',
      'manage_payments',
      'create_paiement',
      'edit_paiement',
      'delete_paiement',
    ],
  },
  {
    key: 'billing',
    label: 'Facturation des dossiers (honoraires, éléments facturables)',
    financial: true,
    keywords: AI_RESTRICTED_DOMAINS[1].keywords,
    codes: [
      'view_billable_items',
      'manage_billable_items',
      'generate_invoice_from_items',
    ],
  },
  {
    key: 'accounting',
    label: 'Comptabilité',
    financial: true,
    keywords: AI_RESTRICTED_DOMAINS[2].keywords,
    codes: [
      'view_accounting',
      'view_accounting_reports',
      'create_ecriture',
      'edit_ecriture',
      'delete_ecriture',
      'manage_chart_of_accounts',
      'open_exercice',
      'close_exercice',
    ],
  },
  {
    key: 'payroll',
    label: 'Paie',
    financial: true,
    keywords: AI_RESTRICTED_DOMAINS[3].keywords,
    codes: [
      'view_payroll',
      'view_payroll_periods',
      'create_payroll_period',
      'edit_payroll_period',
      'close_payroll_period',
      'view_payslips',
      'generate_payslip',
      'edit_payslip',
      'download_payslip',
      'email_payslip',
    ],
  },
  {
    key: 'expenses',
    label: 'Dépenses et fournisseurs',
    financial: true,
    keywords: AI_RESTRICTED_DOMAINS[4].keywords,
    codes: [
      'view_expenses',
      'view_expense_reports',
      'create_expense_report',
      'edit_expense_report',
      'delete_expense_report',
      'validate_expense_report',
      'reimburse_expense_report',
      'view_suppliers',
      'create_supplier',
      'edit_supplier',
      'delete_supplier',
      'view_supplier_invoices',
      'create_supplier_invoice',
      'edit_supplier_invoice',
      'delete_supplier_invoice',
      'validate_supplier_invoice',
      'pay_supplier_invoice',
    ],
  },
  {
    key: 'referrers',
    label: "Apporteurs d'affaires",
    keywords: /\bapporteurs?\b/,
    codes: [
      'view_referrers',
      'create_referrer',
      'edit_referrer',
      'delete_referrer',
      'view_dossier_referrals',
      'create_dossier_referral',
      'edit_dossier_referral',
      'delete_dossier_referral',
    ],
  },
  {
    key: 'commissions',
    label: 'Commissions des apporteurs',
    financial: true,
    keywords: AI_RESTRICTED_DOMAINS[5].keywords,
    codes: [
      'view_referral_commissions',
      'create_referral_commission',
      'edit_referral_commission',
      'validate_referral_commission',
      'pay_referral_commission',
    ],
  },
  {
    key: 'requests',
    label: 'Demandes personnelles',
    keywords: /\b(conges?|demandes? (de conge|d avance))\b/,
    codes: [
      'request_leave',
      'request_salary_advance',
      'view_employee_requests',
      'manage_employee_requests',
    ],
  },
  {
    key: 'messages',
    label: 'Messagerie',
    keywords: /\bmessag\w*\b/,
    codes: ['view_messages', 'send_message', 'delete_message', 'view_all_messages'],
  },
  {
    key: 'reports',
    label: 'Rapports et tableaux de bord',
    keywords: /\b(rapports?|tableaux? de bord|statistiques?)\b/,
    codes: [
      'view_dashboard',
      'view_reports',
      'create_reports',
      'export_reports',
      'view_analytics',
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    keywords: /\b(utilisateurs?|collaborateurs?|roles?|parametres?|administration)\b/,
    codes: [
      'view_users',
      'view_user_directory',
      'create_user',
      'edit_user',
      'delete_user',
      'manage_roles',
      'view_audit_logs',
      'manage_settings',
      'manage_subscription',
    ],
  },
];

const CAPABILITY_PATTERNS: RegExp[] = [
  /\b(mes|les miens|mon niveau d) ?(droits|permissions|acces|habilitations|autorisations|privileges)\b/,
  /\b(quels?|quelles?) (sont )?(les |mes )?(droits|permissions|habilitations|autorisations)\b/,
  /\b(que|quoi|qu est.ce que|quelles? (sont les )?(operations|actions|fonctionnalites|choses|taches)( que)?)\b.{0,40}\b(je peux|puis.je|j ai le droit|je suis autorise|je suis habilite|m est (permis|autorise))\b/,
  /\b(je peux|puis.je) faire quoi\b/,
  /\b(ai.je|est.ce que j ai|j ai)\b.{0,12}\b(acces|le droit|les droits|la permission|l autorisation)\b/,
  /\b(tu peux|peux.tu|pouvez.vous|est.ce que tu peux|est.ce que vous pouvez|as.tu|avez.vous)\b.{0,12}\b(acceder|acces)\b/,
  // « autorisé/autorisée/autoriser » (la faute d'accord est courante à l'oral).
  /\b(suis.je|je suis|j suis|est.ce que je suis) (autoris|habilit)\w*/,
  /\b(qu est.ce que|que) (tu peux|peux.tu|vous pouvez|pouvez.vous) faire pour moi\b/,
  // « … faire quoi ? » en fin de phrase : « je peux / j'ai le droit / je suis autorisé à faire quoi ».
  /\b(je|j ai|moi|me|m)\b.{0,40}\bfaire quoi\b/,
  /\b(autoris|habilit)\w* (a|pour|de) (faire )?quoi\b/,
  /\b(a|de) quoi (ai.je|j ai)\b.{0,12}\b(droit|acces)\b/,
];

/** « … et me donner / lister … » : une vraie demande, pas une question de droits. */
const FOLLOWED_BY_REQUEST =
  /\b(et|pour) (me |m |nous )?(donner|lister|afficher|montrer|dire|resumer|creer|ajouter|modifier|supprimer|envoyer|trouver|chercher|calculer|preparer)\b/;

export function isCapabilityQuestion(question: string): boolean {
  const normalized = normalizeAccessText(question);
  if (!normalized || normalized.length > 300) return false;
  if (FOLLOWED_BY_REQUEST.test(normalized)) return false;
  return CAPABILITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

const FINANCE_UMBRELLA = /\b(financ\w*|argent|compte(s)? du cabinet)\b/;

export function capabilityScope(question: string): CapabilityGroup[] {
  const normalized = normalizeAccessText(question);
  const scoped = AI_CAPABILITY_GROUPS.filter((group) =>
    group.keywords?.test(normalized),
  );
  if (FINANCE_UMBRELLA.test(normalized)) {
    for (const group of AI_CAPABILITY_GROUPS) {
      if (group.financial && !scoped.includes(group)) scoped.push(group);
    }
  }
  return scoped;
}

export interface AccessProfile {
  isAdmin: boolean;
  roleName?: string | null;
  /** code → libellé (description du droit dans le cabinet). */
  permissions: Map<string, string>;
}

/** « ai-je accès… ? », « tu peux accéder… ? » appellent un oui / non. */
function isYesNoAccessQuestion(question: string): boolean {
  const normalized = normalizeAccessText(question);
  return (
    /\b(acceder|acces|le droit|autorise|habilite)\b/.test(normalized) &&
    !/\b(quels?|quelles?|quoi)\b/.test(normalized)
  );
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function describeGroup(group: CapabilityGroup, profile: AccessProfile): string[] {
  return group.codes
    .filter((code) => profile.permissions.has(code))
    .map((code) => lowerFirst(permissionLabel(code, profile.permissions.get(code))));
}

/**
 * Réponse déterministe à « que puis-je faire ? », « ai-je accès à la
 * comptabilité ? », « tu peux accéder aux opérations financières pour moi ? » :
 * construite uniquement à partir des droits réels du rôle de l'utilisateur.
 */
export function buildCapabilityAnswer(
  question: string,
  profile: AccessProfile,
): string {
  const scope = capabilityScope(question);
  const groups = scope.length ? scope : AI_CAPABILITY_GROUPS;
  const role = profile.roleName ? ` **${profile.roleName}**` : '';
  const footer = `\n\nJe respecte ces droits : je ne consulte ni ne modifie rien en dehors de ce périmètre. ${ADMIN_HINT}`;

  if (profile.isAdmin) {
    const target = scope.length
      ? groups.map((group) => group.label.toLowerCase()).join(', ')
      : "l'ensemble des modules du cabinet";
    const answer = isYesNoAccessQuestion(question) ? '✅ **Oui.** ' : '';
    return `${answer}Vous êtes administrateur du cabinet${profile.roleName ? ` (rôle **${profile.roleName}**)` : ''} : vous avez accès à ${target}, et je peux consulter ou agir pour vous sur tout ce périmètre.`;
  }

  const allowed = groups
    .map((group) => ({ group, actions: describeGroup(group, profile) }))
    .filter((entry) => entry.actions.length > 0);
  const denied = groups.filter(
    (group) => !allowed.some((entry) => entry.group === group),
  );

  const lines = allowed.map(
    (entry) => `- **${entry.group.label}** : ${entry.actions.join(', ')}`,
  );
  const deniedLine = denied.length
    ? `🔒 **Non accessible avec votre rôle** : ${denied.map((group) => group.label.toLowerCase()).join(', ')}.`
    : '';
  const intro = `Avec votre rôle${role}, voici ce que vous pouvez faire (et donc ce que je peux faire pour vous) :`;

  if (scope.length) {
    if (!allowed.length) {
      return `🔒 **Non.** Votre rôle${role} ne vous donne pas accès à : ${denied
        .map((group) => group.label.toLowerCase())
        .join(', ')}. Je ne peux donc ni consulter ni modifier ces informations pour vous.\n\n${ADMIN_HINT}`;
    }
    const head = !isYesNoAccessQuestion(question)
      ? intro
      : denied.length
        ? `**En partie.** ${intro}`
        : `✅ **Oui.** ${intro}`;
    return [head, '', ...lines, ...(deniedLine ? ['', deniedLine] : [])].join('\n') + footer;
  }

  if (!allowed.length) {
    return `Votre rôle${role} ne dispose d'aucun droit sur les modules du cabinet. ${ADMIN_HINT}`;
  }
  return (
    [
      `Voici ce que votre rôle${role} vous permet de faire (et donc ce que je peux faire pour vous) :`,
      '',
      ...lines,
      ...(deniedLine ? ['', deniedLine] : []),
    ].join('\n') + footer
  );
}
