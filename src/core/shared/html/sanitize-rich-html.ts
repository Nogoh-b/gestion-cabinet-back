/**
 * HTML d'un message mis en forme dans l'éditeur du chat (e-mail, courrier) →
 * HTML sûr à envoyer : liste blanche de balises, chaque balise reconstruite
 * avec ses seuls attributs permis (liens http(s)/mailto, couleurs, alignement).
 * Tout le reste est retiré ; le texte est gardé.
 *
 * Le texte de l'éditeur (TipTap) n'a que des balises connues ; ce filtre
 * protège aussi d'un appel direct à l'API.
 */

/** Balises gardées (les autres sont retirées, leur texte reste). */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'span', 'mark', 'a',
  'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'div',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

/** Balises dont tout le contenu est retiré (pas seulement la balise). */
const DROPPED_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

const VOID_TAGS = new Set(['br', 'hr']);

/** Propriétés de style gardées et forme de leur valeur. */
const ALLOWED_STYLES: Record<string, RegExp> = {
  color: /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i,
  'background-color': /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i,
  'text-align': /^(left|right|center|justify)$/i,
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attributesOf(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attributes[match[1].toLowerCase()] = decodeAttribute(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attributes;
}

function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((rule) => {
      const index = rule.indexOf(':');
      if (index < 0) return '';
      const property = rule.slice(0, index).trim().toLowerCase();
      const value = rule.slice(index + 1).trim();
      return ALLOWED_STYLES[property]?.test(value) ? `${property}: ${value}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

function safeHref(href: string): string | null {
  const value = href.trim();
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : null;
}

/** Balise ouvrante reconstruite (ou null si refusée). */
function openingTag(name: string, rawAttributes: string): string {
  const attributes = attributesOf(rawAttributes);
  const kept: string[] = [];
  // Surlignage : un <span> avec fond, compris par toutes les messageries.
  if (name === 'mark') {
    const color = attributes['data-color'] || /background-color\s*:\s*([^;]+)/i.exec(attributes.style ?? '')?.[1]?.trim() || '#fef08a';
    const style = cleanStyle(`background-color: ${color}`);
    return `<span${style ? ` style="${escapeAttribute(style)}"` : ''}>`;
  }
  if (attributes.style) {
    const style = cleanStyle(attributes.style);
    if (style) kept.push(`style="${escapeAttribute(style)}"`);
  }
  if (name === 'a') {
    const href = safeHref(attributes.href ?? '');
    if (href) kept.push(`href="${escapeAttribute(href)}"`, 'target="_blank"', 'rel="noopener noreferrer"');
  }
  if ((name === 'td' || name === 'th') && /^\d{1,2}$/.test(attributes.colspan ?? '')) kept.push(`colspan="${attributes.colspan}"`);
  if (name === 'ol' && /^\d{1,4}$/.test(attributes.start ?? '')) kept.push(`start="${attributes.start}"`);
  return `<${name}${kept.length ? ` ${kept.join(' ')}` : ''}${VOID_TAGS.has(name) ? ' /' : ''}>`;
}

export function sanitizeRichHtml(html: string): string {
  const source = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(DROPPED_WITH_CONTENT, '');
  let out = '';
  let last = 0;
  const tag = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(source))) {
    // Texte entre deux balises : un « < » isolé est échappé.
    out += source.slice(last, match.index).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    last = match.index + match[0].length;
    const name = match[1].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (match[0].startsWith('</')) {
      if (!VOID_TAGS.has(name)) out += `</${name === 'mark' ? 'span' : name}>`;
    } else {
      out += openingTag(name, match[2]);
    }
  }
  out += source.slice(last).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return out.trim();
}

/** Texte déjà mis en forme par l'éditeur riche : HTML qui commence par un bloc. */
export function isRichHtml(value: unknown): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|blockquote|div|table|hr)[\s>/]/i.test(String(value ?? ''));
}
