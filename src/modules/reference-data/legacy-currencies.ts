// Liste des devises disponibles dans le cabinet
// Chaque devise pré-remplit : code ISO, symbole, position, décimales, séparateurs.

export interface CurrencyConfig {
  code: string;
  label: string; // Affiché dans le select
  symbol: string;
  position: 'before' | 'after';
  decimals: number;
  thousands_sep: string;
  decimal_sep: string;
  flag?: string;
}

export const CURRENCIES: CurrencyConfig[] = [
  // ── Afrique subsaharienne ───────────────────────────────────────────────────
  {
    code: 'XAF',
    label: 'Franc CFA (CEMAC) — XAF',
    symbol: 'FCFA',
    position: 'after',
    decimals: 0,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇨🇲',
  },
  {
    code: 'XOF',
    label: 'Franc CFA (UEMOA) — XOF',
    symbol: 'FCFA',
    position: 'after',
    decimals: 0,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇸🇳',
  },
  {
    code: 'NGN',
    label: 'Naira nigérian — NGN',
    symbol: '₦',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇳🇬',
  },
  {
    code: 'GHS',
    label: 'Cedi ghanéen — GHS',
    symbol: '₵',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇬🇭',
  },
  {
    code: 'KES',
    label: 'Shilling kényan — KES',
    symbol: 'KSh',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇰🇪',
  },
  {
    code: 'ZAR',
    label: 'Rand sud-africain — ZAR',
    symbol: 'R',
    position: 'before',
    decimals: 2,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇿🇦',
  },
  {
    code: 'MAD',
    label: 'Dirham marocain — MAD',
    symbol: 'DH',
    position: 'after',
    decimals: 2,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇲🇦',
  },
  {
    code: 'TND',
    label: 'Dinar tunisien — TND',
    symbol: 'DT',
    position: 'after',
    decimals: 3,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇹🇳',
  },
  {
    code: 'DZD',
    label: 'Dinar algérien — DZD',
    symbol: 'DA',
    position: 'after',
    decimals: 2,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇩🇿',
  },
  {
    code: 'EGP',
    label: 'Livre égyptienne — EGP',
    symbol: 'ج.م',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇪🇬',
  },

  // ── Europe ──────────────────────────────────────────────────────────────────
  {
    code: 'EUR',
    label: 'Euro — EUR',
    symbol: '€',
    position: 'after',
    decimals: 2,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇪🇺',
  },
  {
    code: 'CHF',
    label: 'Franc suisse — CHF',
    symbol: 'CHF',
    position: 'before',
    decimals: 2,
    thousands_sep: "'",
    decimal_sep: '.',
    flag: '🇨🇭',
  },
  {
    code: 'GBP',
    label: 'Livre sterling — GBP',
    symbol: '£',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇬🇧',
  },

  // ── Amériques ───────────────────────────────────────────────────────────────
  {
    code: 'USD',
    label: 'Dollar américain — USD',
    symbol: '$',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇺🇸',
  },
  {
    code: 'CAD',
    label: 'Dollar canadien — CAD',
    symbol: 'CA$',
    position: 'before',
    decimals: 2,
    thousands_sep: ' ',
    decimal_sep: ',',
    flag: '🇨🇦',
  },

  // ── Asie / Moyen-Orient ──────────────────────────────────────────────────────
  {
    code: 'AED',
    label: 'Dirham des Émirats — AED',
    symbol: 'د.إ',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇦🇪',
  },
  {
    code: 'SAR',
    label: 'Riyal saoudien — SAR',
    symbol: '﷼',
    position: 'after',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇸🇦',
  },
  {
    code: 'INR',
    label: 'Roupie indienne — INR',
    symbol: '₹',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇮🇳',
  },
  {
    code: 'CNY',
    label: 'Yuan chinois — CNY',
    symbol: '¥',
    position: 'before',
    decimals: 2,
    thousands_sep: ',',
    decimal_sep: '.',
    flag: '🇨🇳',
  },
];

/** Trouve une devise par son code ISO (retourne undefined si inconnue). */
export function getCurrencyByCode(code: string): CurrencyConfig | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

/**
 * Formate un montant selon la configuration devise d'un cabinet.
 * Exemple : formatAmount(150000, { symbol:'FCFA', position:'after', decimals:0, ... })
 *           → "150 000 FCFA"
 */
export function formatAmount(
  amount: number,
  cfg: Pick<
    CurrencyConfig,
    'symbol' | 'position' | 'decimals' | 'thousands_sep' | 'decimal_sep'
  >,
): string {
  const [intPart, decPart] = amount.toFixed(cfg.decimals).split('.');
  const formatted =
    intPart.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousands_sep) +
    (cfg.decimals > 0 ? cfg.decimal_sep + decPart : '');

  return cfg.position === 'before'
    ? `${cfg.symbol} ${formatted}`
    : `${formatted} ${cfg.symbol}`;
}
