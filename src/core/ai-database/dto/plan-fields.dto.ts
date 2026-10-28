import { PlanFieldOption } from '../write/plan-field-options';

export type { PlanFieldOption };

/**
 * Champ d'une opération du plan, tel que la carte de confirmation l'affiche
 * et le laisse modifier. `name` est la clé de `op.fields` à écrire.
 */
export interface PlanFieldDescriptor {
  name: string;
  label: string;
  /** `longtext` : texte long (corps d'un message) ; `multi` : choix multiple parmi `options`. */
  kind: 'reference' | 'enum' | 'boolean' | 'date' | 'datetime' | 'number' | 'text' | 'longtext' | 'multi';
  /** Valeur du plan proposée par l'IA (brute). */
  value: unknown;
  /** Option correspondant à la valeur du plan, quand elle est reconnue. */
  selected?: PlanFieldOption | null;
  /** Valeurs possibles (jamais la ligne complète : `{ value, label }` seulement). */
  options?: PlanFieldOption[];
  /** Table trop grande pour une liste : recherche via `write/field-options`. */
  searchable?: boolean;
  /** Clés dont dépendent les options (ex. sous-type ← type de procédure). */
  dependsOn?: string[];
  /** Autres clés du même champ (alias ↔ colonne) à retirer quand on le modifie. */
  clears?: string[];
  editable: boolean;
  /** La valeur de l'IA n'a pas été reconnue : l'utilisateur devrait choisir. */
  needsChoice?: boolean;
  /** Valeur par défaut, vide ou champ technique : affiché sous « autres champs ». */
  secondary?: boolean;
  note?: string;
  /**
   * Modification d'un enregistrement : valeur actuelle lisible (« avant »),
   * '' si le champ est vide. Absent quand elle n'est pas connue.
   */
  previous?: string;
  /** Corps de message enrichi : gras + liens et aperçu fidèle à l'envoi. */
  format?: 'email' | 'whatsapp';
}

export interface PlanOperationDescriptor {
  index: number;
  entityLabel: string;
  fields: PlanFieldDescriptor[];
  /** Ce que fait l'opération, en une phrase (fournie par le plan). */
  summary?: string;
  /**
   * Enregistrement(s) visé(s) par une modification ou une suppression :
   * « Audience du 15/10/2025 à 09:00 · Dossier DOS-2026-0039 », ou
   * « Tous les éléments correspondants (19) : Dossier = … · Statut = … ».
   */
  target?: string;
  /** Action : ce qui va partir (« À : client@x.com · 2 facture(s) impayée(s) »). */
  preview?: string;
  /** Action : avertissement (irréversible…). */
  warning?: string;
}

export interface PlanFieldsResponse {
  operations: PlanOperationDescriptor[];
}

export interface FieldOptionsRequest {
  entity: string;
  operation: 'INSERT' | 'UPDATE';
  field: string;
  /** Champs actuels de l'opération (pour filtrer un champ dépendant). */
  fields?: Record<string, any>;
  q?: string;
}

export interface FieldOptionsResponse {
  options: PlanFieldOption[];
  searchable: boolean;
}
