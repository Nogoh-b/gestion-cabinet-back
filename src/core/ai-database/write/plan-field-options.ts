/**
 * Options d'un champ de plan d'écriture IA, affichées dans la carte de
 * confirmation (listes déroulantes préremplies, libellés lisibles).
 */
import type { CreateChoice } from './create-choice';

export interface PlanFieldOption {
  /** Identifiant, valeur d'énumération… ou `{ $create: "X" }` (choix « Créer »). */
  value: string | number | boolean | null | CreateChoice;
  label: string;
  /** Option désignant une ligne créée par une opération précédente du plan. */
  createdBy?: number;
}

/** `{{new_client.id}}` : identifiant d'une ligne créée plus tôt dans le plan. */
export const PLAN_REF = /^\{\{\s*(\w+)\.id\s*\}\}$/;

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** « FIRST_INSTANCE » → « First instance », « temps_passe » → « Temps passe ». */
export function humanize(value: string): string {
  return capitalize(value.replace(/[_-]+/g, ' ').trim().toLowerCase());
}

/** Un libellé tout en capitales (« CASSATION ») est une clé, pas un libellé. */
function labelOf(text: string): string {
  const label = text.trim();
  return /^[A-Z0-9_]+$/.test(label) ? humanize(label) : capitalize(label);
}

/**
 * Liste de valeurs écrite dans la description d'une colonne `@BusinessColumn` :
 * « BD: 1=ACTIVE/Actif, 0=INACTIVE/Inactif. … », « BD: 'OUVERT' ou 'CLOTURE'. »,
 * « 0=Normale, 1=Haute, 2=Prioritaire ». Un texte libre donne `null`.
 */
export function parseValueList(description?: string | null): PlanFieldOption[] | null {
  if (!description) return null;
  const prefixed = /^\s*BD(?:\s+attendu)?\s*:/i.test(description);
  let body = description.replace(/^\s*BD(?:\s+attendu)?\s*:\s*/i, '');
  // Première phrase seulement (« … . En SQL utiliser le nombre. »), sans couper « 5.5 ».
  const end = body.search(/\.(\s|$)/);
  if (end >= 0) body = body.slice(0, end);
  const items = body.split(/\s*,\s*|\s+ou\s+/).map((item) => item.trim()).filter(Boolean);
  if (items.length < 2) return null;

  const options: PlanFieldOption[] = [];
  for (const item of items) {
    const match = item.match(/^'?(-?[\w.]+)'?\s*(?:=\s*(.+))?$/u);
    if (!match) return null;
    const [, raw, rhs] = match;
    if (!prefixed && rhs === undefined) return null;
    const value = /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : raw;
    // « 1=ACTIVE/Actif » : le libellé est après la barre.
    const label = rhs === undefined ? humanize(raw) : labelOf(rhs.includes('/') ? rhs.split('/').slice(1).join('/') : rhs);
    options.push({ value, label });
  }
  // Sans « BD: », seules les paires numériques (« 0=Normale, 1=Haute ») sont fiables.
  if (!prefixed && !options.every((option) => typeof option.value === 'number')) return null;
  return options;
}

export interface FixedValueColumn {
  type?: unknown;
  enum?: Array<string | number>;
}

export function isBooleanColumn(column: FixedValueColumn): boolean {
  return column.type === 'boolean' || column.type === 'bool' || column.type === Boolean;
}

/**
 * Valeurs possibles d'une colonne à choix fixe : l'énumération de la colonne
 * (libellés tirés de sa description), un booléen, ou la liste de la description.
 */
export function fixedOptions(column: FixedValueColumn, description?: string | null): PlanFieldOption[] | null {
  if (isBooleanColumn(column)) return [{ value: true, label: 'Oui' }, { value: false, label: 'Non' }];
  const parsed = parseValueList(description);
  if (column.enum?.length) {
    return column.enum.map((value) => ({
      value,
      label: parsed?.find((option) => String(option.value) === String(value))?.label ?? humanize(String(value)),
    }));
  }
  return parsed;
}

const LABEL_GROUPS: Array<{ keys: string[]; separator: string }> = [
  { keys: ['full_name'], separator: '' },
  { keys: ['company_name'], separator: '' },
  { keys: ['first_name', 'last_name'], separator: ' ' },
  { keys: ['dossier_number', 'object'], separator: ' — ' },
  ...['name', 'label', 'title', 'libelle', 'intitule', 'designation', 'numero', 'reference', 'email']
    .map((key) => ({ keys: [key], separator: '' })),
];

const present = (value: unknown) =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== '') && typeof value !== 'object';

/**
 * Libellé d'une ligne (client, type, juridiction, employé…) ou des champs d'une
 * ligne créée par le plan : « OVAMBE NDONO », « Client particulier (PART) ».
 */
export function rowLabel(row: Record<string, any> | null | undefined): string {
  if (!row) return '';
  for (const group of LABEL_GROUPS) {
    const parts = group.keys.map((key) => row[key]).filter(present).map((value) => String(value).trim());
    if (!parts.length) continue;
    const label = parts.join(group.separator);
    const code = present(row.code) ? String(row.code).trim() : '';
    return code && !label.includes(code) ? `${label} (${code})` : label;
  }
  // Employé : les noms sont sur l'utilisateur rattaché.
  if (row.user && typeof row.user === 'object') {
    const label = rowLabel(row.user);
    if (label) return label;
  }
  if (present(row.code)) return String(row.code);
  return row.id !== undefined ? `#${row.id}` : '';
}
