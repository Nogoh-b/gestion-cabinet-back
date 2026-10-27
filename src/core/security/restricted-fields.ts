import { StreamableFile } from '@nestjs/common';
import { AI_RESTRICTED_COLUMNS } from 'src/core/ai-database/ai-access-policy';
import { UserRole } from 'src/core/enums/user-role.enum';

/**
 * CHAMPS FINANCIERS MASQUÉS DANS LES RÉPONSES DE L'API — source de vérité
 * unique côté HTTP, alignée sur celle de l'assistant IA.
 *
 * Un avocat sans droit sur les factures ne doit voir ni le budget d'un
 * dossier, ni ses frais, ni ses factures ; sans droit sur la paie, ni salaire
 * ni taux horaire d'un employé ; sans droit sur les commissions, ni taux ni
 * montant de commission d'un apporteur. Les colonnes viennent de
 * `AI_RESTRICTED_COLUMNS` : l'IA et l'API ne peuvent pas diverger.
 *
 * Les résultats de procédure (`settlement_amount`, `damages_awarded`,
 * `costs_awarded`) ne sont volontairement PAS concernés : ce sont des données
 * de l'affaire, utiles à l'avocat.
 */

/** Champ → droits dont UN SEUL suffit pour le voir. */
type FieldRules = Record<string, string[]>;

function flattenColumns(columns: Record<string, FieldRules>): FieldRules {
  const rules: FieldRules = {};
  for (const fields of Object.values(columns)) {
    for (const [field, permissions] of Object.entries(fields)) {
      rules[field] = [...new Set([...(rules[field] ?? []), ...permissions])];
    }
  }
  return rules;
}

/**
 * Masqués partout dans une réponse : les colonnes de l'IA et des agrégats
 * dérivés au nom sans ambiguïté (totaux de factures d'un dossier ou d'un
 * client, factures jointes, statistiques financières, commissions cumulées).
 */
export const RESTRICTED_RESPONSE_FIELDS: FieldRules = {
  ...flattenColumns(AI_RESTRICTED_COLUMNS),
  factures: ['view_factures'],
  total_factures_amount: ['view_factures'],
  paid_factures_amount: ['view_factures'],
  outstanding_balance: ['view_factures'],
  financialStats: ['view_factures'],
  total_paid_commissions: ['view_referral_commissions'],
  total_pending_commissions: ['view_referral_commissions'],
};

/**
 * Noms trop génériques pour être masqués partout : retirés seulement d'un
 * objet dossier (reconnu à sa clé `dossier_number`).
 */
export const RESTRICTED_DOSSIER_FIELDS: FieldRules = {
  paid_amount: ['view_factures'],
  facture_count: ['view_factures'],
};

export interface RestrictedFieldsUser {
  role?: string | null;
  permissions?: readonly string[] | null;
}

/**
 * Accès complet : administration du cabinet et SUPER_ADMIN. Le portail
 * client n'est pas filtré ici : il ne montre au client que ses propres
 * dossiers et factures, borné par les routes @AllowClient().
 */
export function seesAllRestrictedFields(user: RestrictedFieldsUser): boolean {
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.CLIENT ||
    user.permissions?.includes('SUPER_ADMIN') === true
  );
}

function hiddenFrom(rules: FieldRules, user: RestrictedFieldsUser): Set<string> {
  const granted = new Set(user.permissions ?? []);
  return new Set(
    Object.entries(rules)
      .filter(([, permissions]) => !permissions.some((code) => granted.has(code)))
      .map(([field]) => field),
  );
}

export interface HiddenFields {
  everywhere: Set<string>;
  onDossier: Set<string>;
}

/** Champs à retirer des réponses pour cet utilisateur (vide = rien à faire). */
export function hiddenResponseFields(
  user: RestrictedFieldsUser | null | undefined,
): HiddenFields {
  if (!user || seesAllRestrictedFields(user)) {
    return { everywhere: new Set(), onDossier: new Set() };
  }
  return {
    everywhere: hiddenFrom(RESTRICTED_RESPONSE_FIELDS, user),
    onDossier: hiddenFrom(RESTRICTED_DOSSIER_FIELDS, user),
  };
}

/** Objets « de données » seulement : ni Date, ni fichier, ni flux, ni promesse. */
function isWalkable(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (value instanceof StreamableFile || Buffer.isBuffer(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.pipe === 'function' ||
    typeof candidate.then === 'function' ||
    typeof candidate.subscribe === 'function'
  ) {
    return false;
  }
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Retire les champs masqués de `value`, à toute profondeur. Copie à
 * l'écriture : les objets sans champ masqué sont renvoyés tels quels, les
 * autres sont copiés (prototype conservé), jamais modifiés — une réponse
 * peut venir d'un cache partagé.
 */
export function redactRestrictedFields<T>(value: T, hidden: HiddenFields): T {
  if (!hidden.everywhere.size && !hidden.onDossier.size) return value;
  /** Nœuds déjà traités → leur version expurgée (références partagées). */
  const done = new WeakMap<object, unknown>();
  const inProgress = new WeakSet<object>();
  /**
   * Cycle : la référence vers un ancêtre encore en cours reçoit une coquille
   * vide, remplie à la fin de son traitement — jamais l'original, qui
   * porterait encore les champs masqués.
   */
  const forward = new WeakMap<object, any>();

  const shellOf = (node: object) =>
    Array.isArray(node) ? [] : Object.create(Object.getPrototypeOf(node));

  const walk = (node: unknown): unknown => {
    const isArray = Array.isArray(node);
    if (!isArray && !isWalkable(node)) return node;
    const source = node as object;
    if (done.has(source)) return done.get(source);
    if (inProgress.has(source)) {
      if (!forward.has(source)) forward.set(source, shellOf(source));
      return forward.get(source);
    }
    inProgress.add(source);

    let result: any = source;
    if (isArray) {
      const items = source as unknown[];
      for (let index = 0; index < items.length; index++) {
        const next = walk(items[index]);
        if (next === items[index]) continue;
        if (result === source) result = items.slice();
        result[index] = next;
      }
    } else {
      const record = source as Record<string, unknown>;
      const isDossier = Object.prototype.hasOwnProperty.call(record, 'dossier_number');
      for (const key of Object.keys(record)) {
        const hide =
          hidden.everywhere.has(key) || (isDossier && hidden.onDossier.has(key));
        const next = hide ? undefined : walk(record[key]);
        if (!hide && next === record[key]) continue;
        if (result === source) result = Object.assign(shellOf(source), record);
        if (hide) delete result[key];
        else result[key] = next;
      }
    }

    inProgress.delete(source);
    const shell = forward.get(source);
    if (shell) {
      if (isArray) shell.push(...result);
      else Object.assign(shell, result);
      result = shell;
    }
    done.set(source, result);
    return result;
  };

  return walk(value) as T;
}

/**
 * Retire d'une saisie (mise à jour) les colonnes restreintes d'une table que
 * l'utilisateur ne peut pas lire : il ne voit pas la valeur en place, il ne
 * peut donc pas l'écraser — ni l'effacer en renvoyant un formulaire où le
 * champ est vide.
 */
export function stripRestrictedInput<T extends object>(
  table: keyof typeof AI_RESTRICTED_COLUMNS,
  input: T,
  user: RestrictedFieldsUser | null | undefined,
): T {
  if (!input || typeof input !== 'object' || !user || seesAllRestrictedFields(user)) {
    return input;
  }
  const hidden = hiddenFrom(AI_RESTRICTED_COLUMNS[table] ?? {}, user);
  if (![...hidden].some((field) => field in input)) return input;
  const copy = Object.assign(Object.create(Object.getPrototypeOf(input)), input);
  hidden.forEach((field) => delete copy[field]);
  return copy;
}
