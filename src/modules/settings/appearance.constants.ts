/**
 * Apparence de l'interface — valeurs autorisées et défauts.
 *
 * L'apparence est personnelle (table `user_settings`). Les défauts se
 * propagent à la création : plateforme → nouveau cabinet → nouveau membre.
 * Les clés de thème et de police doivent rester alignées sur le front
 * (`app/configuration/types/app-settings.type.ts` et `fonts.type.ts`).
 */

export const THEME_NAMES = [
  'ocean',
  'silver',
  'yellow',
  'forest',
  'sunset',
  'rose',
  'midnight',
  'crimson',
  'emerald',
  'copper',
  'slate',
  'lavender',
] as const;
export type ThemeName = (typeof THEME_NAMES)[number] | `#${string}`;

export const FONT_SIZES = ['sm', 'md', 'lg'] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const SIDEBAR_STYLES = ['light', 'dark', 'tinted'] as const;
export type SidebarStyle = (typeof SIDEBAR_STYLES)[number];

export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export interface AppearanceDefaults {
  theme_name: ThemeName;
  font_ui: string;
  font_heading: string;
  font_mono: string;
  font_size: FontSize;
  sidebar_style: SidebarStyle;
}

/** Défaut produit, utilisé quand rien d'autre n'est configuré. */
export const APPEARANCE_FALLBACK: AppearanceDefaults = {
  theme_name: 'midnight',
  font_ui: 'outfit',
  font_heading: 'outfit',
  font_mono: 'jetbrains_mono',
  font_size: 'lg',
  sidebar_style: 'tinted',
};

/** Clé de police : identifiant snake_case court (ex. `plus_jakarta_sans`). */
export const FONT_KEY_PATTERN = /^(?:[a-z0-9_]{1,50}|google:[A-Za-z][A-Za-z0-9 ]{0,42})$/;
export const THEME_PATTERN = /^(?:ocean|silver|yellow|forest|sunset|rose|midnight|crimson|emerald|copper|slate|lavender|#[0-9a-fA-F]{6})$/;

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && THEME_PATTERN.test(value);
}

export function isFontSize(value: unknown): value is FontSize {
  return FONT_SIZES.includes(value as FontSize);
}

export function isSidebarStyle(value: unknown): value is SidebarStyle {
  return SIDEBAR_STYLES.includes(value as SidebarStyle);
}
