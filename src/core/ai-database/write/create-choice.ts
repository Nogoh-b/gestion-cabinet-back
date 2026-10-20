/**
 * Choix « ➕ Créer « X » » de la carte de confirmation.
 *
 * La valeur d'une clé étrangère devient `{ $create: "X" }`. L'exécution du plan
 * crée alors la ligne telle quelle, sans refaire de recherche ni demander de
 * choisir une seconde fois (GenericWriteService.materializeCreateChoices) :
 * la décision prise dans la carte est appliquée comme affichée.
 */

export const CREATE_KEY = '$create';

export interface CreateChoice {
  $create: string;
}

export function createChoice(label: string): CreateChoice {
  return { [CREATE_KEY]: label.trim() } as CreateChoice;
}

export function isCreateChoice(value: unknown): value is CreateChoice {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[CREATE_KEY] === 'string' &&
    !!String((value as Record<string, unknown>)[CREATE_KEY]).trim()
  );
}

export function createChoiceLabel(value: CreateChoice): string {
  return String(value[CREATE_KEY]).trim();
}

/**
 * Référentiels exclus de la création automatique (NEVER_AUTO_CREATE) que
 * l'utilisateur peut tout de même créer en le choisissant explicitement.
 * Les comptes, collaborateurs, agences, lieux et objets de workflow restent
 * réservés à leurs écrans dédiés.
 */
const CREATABLE_ON_CHOICE = new Set([
  'procedure_types',
  'procedure_type',
  'jurisdictions',
  'jurisdiction',
]);

export function canCreateOnChoice(table: string, neverAutoCreate: Set<string>): boolean {
  return !neverAutoCreate.has(table) || CREATABLE_ON_CHOICE.has(table);
}

const isId = (value: unknown) =>
  typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value));

interface CreateDefaults {
  /** Champs de l'opération à résoudre avant (le type avant son sous-type). */
  after?: string[];
  /** Raison affichée quand un champ de `after` n'est pas encore choisi. */
  missingParent?: string;
  /** Filtres pour reconnaître une valeur existante de ce champ. */
  match?: Record<string, any>;
  fields: (resolved: Record<string, any>) => Record<string, any>;
}

/**
 * Champs posés sur la ligne créée, selon le champ de l'opération qui la
 * demande (table de l'opération → colonne de clé étrangère).
 */
export const CREATE_DEFAULTS: Record<string, Record<string, CreateDefaults>> = {
  dossiers: {
    // Types et sous-types partagent la table procedure_types.
    procedure_type_id: {
      match: { is_subtype: false },
      fields: () => ({ is_subtype: false, hierarchy_level: 1 }),
    },
    procedure_subtype_id: {
      after: ['procedure_type_id'],
      // Sans parent, le handler en ferait un type principal.
      missingParent: 'choisissez d’abord son type de procédure',
      match: { is_subtype: true },
      fields: (resolved) => ({
        is_subtype: true,
        hierarchy_level: 2,
        ...(isId(resolved.procedure_type_id) && { parent_id: Number(resolved.procedure_type_id) }),
      }),
    },
  },
};
