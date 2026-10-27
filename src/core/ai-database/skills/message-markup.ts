// src/core/ai-database/skills/message-markup.ts
//
// Mise en forme légère des messages rédigés (e-mail, WhatsApp), la même que
// celle de l'éditeur du chat (front : AiChatbot/chat-message-format.ts) :
//
//   e-mail    **gras**  _italique_  ++souligné++  ~~barré~~  [libellé](URL)
//   WhatsApp  *gras*    _italique_                ~barré~    ```code```
//   les deux  - liste à tirets   • liste à puces   1. liste numérotée
//             > citation   paragraphes séparés par une ligne vide
//
// Tout le reste est échappé (aucune balise injectée) ; seuls les liens
// http(s) deviennent cliquables.

export type MessageSyntax = 'email' | 'whatsapp';

const PLACEHOLDER = '';
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)/g;
const BARE_URL = /https?:\/\/[^\s<>"')\]]+/g;
const TRAILING_PUNCT = /[.,;:!?'"’”»]+$/;
// Délimiteurs d'une mise en forme : pas au milieu d'un mot (« nom_prenom » reste tel quel).
const BEFORE = '(^|[^\\p{L}\\p{N}_*~+])';
const AFTER = '(?=$|[^\\p{L}\\p{N}_*~+])';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Paires de marqueurs → `wrap(contenu)`, hors du milieu d'un mot. */
function replaceMarker(text: string, marker: string, wrap: (inner: string) => string): string {
  // « ~ » ne s'échappe pas en mode Unicode (/u) : seuls * et + en ont besoin.
  const quoted = marker.replace(/[*+]/g, '\\$&');
  const pattern = new RegExp(`${BEFORE}${quoted}(?!\\s)((?:(?!${quoted}).)+?)(?<!\\s)${quoted}${AFTER}`, 'gu');
  return text.replace(pattern, (_, before, inner) => `${before}${wrap(inner)}`);
}

/** Ligne → HTML (styles en ligne : les messageries ignorent les feuilles de style). */
function inlineToHtml(segment: string, syntax: MessageSyntax): string {
  const kept: string[] = [];
  const keep = (html: string) => `${PLACEHOLDER}${kept.push(html) - 1}${PLACEHOLDER}`;
  let out = escapeHtml(segment);
  out = out.replace(/```([^`\n]+)```|`([^`\n]+)`/g, (_, triple, single) =>
    keep(`<code style="font-family:Consolas,Menlo,monospace;background:#f1f5f9;padding:0 3px;border-radius:3px">${triple ?? single}</code>`));
  out = out.replace(MARKDOWN_LINK, (_, label, url) => (/^https?:\/\//i.test(url) ? keep(`<a href="${url}">${label}</a>`) : label));
  out = out.replace(BARE_URL, (raw) => {
    const url = raw.replace(TRAILING_PUNCT, '');
    return url ? `${keep(`<a href="${url}">${url}</a>`)}${raw.slice(url.length)}` : raw;
  });
  out = replaceMarker(out, '**', (inner) => `<strong>${inner}</strong>`);
  if (syntax === 'email') {
    out = replaceMarker(out, '++', (inner) => `<u>${inner}</u>`);
    out = replaceMarker(out, '~~', (inner) => `<s>${inner}</s>`);
  } else {
    out = replaceMarker(out, '*', (inner) => `<strong>${inner}</strong>`);
    out = replaceMarker(out, '~~', (inner) => `<s>${inner}</s>`);
    out = replaceMarker(out, '~', (inner) => `<s>${inner}</s>`);
  }
  out = replaceMarker(out, '_', (inner) => `<em>${inner}</em>`);
  return out.replace(new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'), (_, index) => kept[Number(index)] ?? '');
}

type ListKind = 'dash' | 'disc' | 'ordered';
type Block =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'list'; kind: ListKind; start: number; items: string[] };

const LIST_ITEM: Array<{ kind: ListKind; pattern: RegExp }> = [
  { kind: 'dash', pattern: /^\s*[-–—]\s+(.*)$/ },
  { kind: 'disc', pattern: /^\s*[•·*]\s+(.*)$/ },
  { kind: 'ordered', pattern: /^\s*(\d{1,3})[.)]\s+(.*)$/ },
];
const QUOTE_LINE = /^\s*>\s?(.*)$/;

/** Paragraphes, listes (à tirets, à puces, numérotées) et citations. */
export function parseMessageBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      close();
      continue;
    }
    const block = current as Block | null;
    const item = LIST_ITEM.map(({ kind, pattern }) => ({ kind, match: pattern.exec(line) })).find((entry) => entry.match);
    if (item?.match) {
      const content = item.kind === 'ordered' ? item.match[2] : item.match[1];
      if (block?.type === 'list' && block.kind === item.kind) block.items.push(content);
      else {
        close();
        current = { type: 'list', kind: item.kind, start: item.kind === 'ordered' ? Number(item.match[1]) || 1 : 1, items: [content] };
      }
      continue;
    }
    const quote = QUOTE_LINE.exec(line);
    if (quote) {
      if (block?.type === 'quote') block.lines.push(quote[1]);
      else {
        close();
        current = { type: 'quote', lines: [quote[1]] };
      }
      continue;
    }
    if (block?.type === 'paragraph') block.lines.push(line);
    else {
      close();
      current = { type: 'paragraph', lines: [line] };
    }
  }
  close();
  return blocks;
}

const LIST_STYLE = 'margin:0 0 12px;padding-left:22px';
const ITEM_STYLE = 'margin:0 0 4px';

/**
 * Texte rédigé (IA ou éditeur du chat) → HTML d'e-mail : paragraphes, gras,
 * italique, souligné, barré, listes, citations, liens http(s).
 */
export function messageToHtml(text: string, syntax: MessageSyntax = 'email'): string {
  return parseMessageBlocks(text)
    .map((block) => {
      if (block.type === 'paragraph') {
        return `<p>${block.lines.map((line) => inlineToHtml(line, syntax)).join('<br>')}</p>`;
      }
      if (block.type === 'quote') {
        return `<blockquote style="margin:0 0 12px;padding:2px 0 2px 12px;border-left:3px solid #cbd5e1;color:#475569">${block.lines.map((line) => inlineToHtml(line, syntax)).join('<br>')}</blockquote>`;
      }
      if (block.kind === 'dash') {
        // Tirets écrits dans le texte : les messageries ignorent souvent list-style.
        return `<ul style="margin:0 0 12px;padding-left:8px;list-style:none">${block.items.map((item) => `<li style="${ITEM_STYLE}">&ndash;&nbsp;${inlineToHtml(item, syntax)}</li>`).join('')}</ul>`;
      }
      const items = block.items.map((item) => `<li style="${ITEM_STYLE}">${inlineToHtml(item, syntax)}</li>`).join('');
      return block.kind === 'ordered'
        ? `<ol style="${LIST_STYLE}"${block.start !== 1 ? ` start="${block.start}"` : ''}>${items}</ol>`
        : `<ul style="${LIST_STYLE}">${items}</ul>`;
    })
    .join('\n');
}

/** Retire gras, italique, souligné, barré et code (les listes et citations restent). */
function stripMarks(text: string): string {
  let out = String(text ?? '').replace(/```([^`\n]+)```|`([^`\n]+)`/g, (_, triple, single) => triple ?? single);
  for (const marker of ['**', '++', '~~', '*', '~', '_']) out = replaceMarker(out, marker, (inner) => inner);
  return out;
}

/** Version texte de l'e-mail : `libellé (URL)`, sans marqueurs ; listes conservées. */
export function messageToPlain(text: string): string {
  return stripMarks(
    String(text ?? '').replace(MARKDOWN_LINK, (_full, label, url) => (/^https?:\/\//i.test(url) ? `${label} (${url})` : label)),
  ).trim();
}

/** Objet d'e-mail : sans mise en forme ni URL (libellés seuls). */
export function stripMessageMarkup(text: string): string {
  return stripMarks(String(text ?? '').replace(MARKDOWN_LINK, '$1')).trim();
}

/**
 * Texte rédigé → syntaxe WhatsApp : **gras** → *gras*, ~~barré~~ → ~barré~,
 * souligné retiré (WhatsApp n'en a pas), liens « libellé (URL) ».
 */
export function messageToWhatsApp(text: string): string {
  let out = String(text ?? '').replace(MARKDOWN_LINK, (_full, label, url) => (/^https?:\/\//i.test(url) ? `${label} (${url})` : label));
  out = replaceMarker(out, '**', (inner) => `*${inner}*`);
  out = replaceMarker(out, '~~', (inner) => `~${inner}~`);
  out = replaceMarker(out, '++', (inner) => inner);
  return out.trim();
}
