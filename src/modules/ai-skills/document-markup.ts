// src/modules/ai-skills/document-markup.ts
import { pdfText } from './skill-templates';

/**
 * Balisage des documents rédigés par l'IA (actes, contrats, modèles) et sa
 * conversion en HTML pour l'aperçu, l'éditeur, le PDF et le Word du chat.
 *
 * L'IA n'écrit jamais de HTML : elle écrit ce balisage léger, que seul ce
 * module transforme en balises connues, tout le texte étant échappé.
 *
 * - `#`, `##`, `###` en tête de ligne : titres (le `#` est centré) ;
 * - `- ` / `• ` : puces ; `1. ` : liste numérotée ; `> ` : citation ;
 * - lignes `| a | b |` : tableau (la ligne `|---|` sépare l'en-tête) ;
 * - `---` seul : filet ; `[[centre]]`, `[[droite]]`, `[[justifie]]` en tête
 *   de paragraphe : alignement ;
 * - en ligne : `**gras**`, `*italique*`, `__souligné__` ;
 * - `{{variable}}` et `{{#if x}}…{{/if}}` (modèles) restent tels quels.
 */

type Align = 'left' | 'center' | 'right' | 'justify';

const ALIGN_MARKERS: Array<[RegExp, Align]> = [
  [/^\s*\[\[\s*(centre|centré|centrer|center|centered)\s*\]\]\s*/i, 'center'],
  [/^\s*\[\[\s*(droite|à droite|a droite|right)\s*\]\]\s*/i, 'right'],
  [/^\s*\[\[\s*(justifie|justifié|justify)\s*\]\]\s*/i, 'justify'],
  [/^\s*\[\[\s*(gauche|left)\s*\]\]\s*/i, 'left'],
];

/** Marqueur d'alignement en tête de ligne, retiré du texte. */
function takeAlign(line: string): { align?: Align; text: string } {
  for (const [pattern, align] of ALIGN_MARKERS) {
    if (pattern.test(line)) return { align, text: line.replace(pattern, '') };
  }
  return { text: line };
}

const alignStyle = (align?: Align) => (align && align !== 'left' ? ` style="text-align:${align};"` : '');

/** Texte d'une ligne : échappé, puis gras, souligné, italique. */
export function inlineMarkup(text: string): string {
  return pdfText(text)
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([^\n]*?\S)__/g, '<u>$1</u>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    // `_x_` hors des mots : les variables {{date_fmt}} et noms_composés restent intacts.
    .replace(/(^|[^\w{])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w}])/g, '$1<em>$2</em>');
}

const LIST_ITEM = /^\s*(?:[-•*]|(\d+)[.)])\s+(.*)$/;
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RULE_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s*(#{1,4})\s+(.*)$/;
const PAGE_BREAK = /^\s*\[\[\s*saut de page\s*\]\]\s*$/i;

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function tableHtml(lines: string[]): string {
  const separator = lines.findIndex((line) => TABLE_SEPARATOR.test(line));
  const header = separator === 1 ? tableCells(lines[0]) : null;
  const rows = lines.filter((line, index) => !TABLE_SEPARATOR.test(line) && !(header && index === 0)).map(tableCells);
  const width = Math.max(header?.length ?? 0, ...rows.map((row) => row.length));
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill('')];
  const head = header ? `<thead><tr>${pad(header).map((cell) => `<th>${inlineMarkup(cell)}</th>`).join('')}</tr></thead>` : '';
  const body = rows.map((row) => `<tr>${pad(row).map((cell) => `<td>${inlineMarkup(cell)}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%;">${head}<tbody>${body}</tbody></table>`;
}

/** Balisage du document → HTML (seules des balises connues, texte échappé). */
export function documentHtml(markup: string): string {
  const lines = String(markup ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let paragraphAlign: Align | undefined;

  const flush = () => {
    if (paragraph.length) out.push(`<p${alignStyle(paragraphAlign)}>${paragraph.map(inlineMarkup).join('<br/>')}</p>`);
    paragraph = [];
    paragraphAlign = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || PAGE_BREAK.test(line)) {
      flush();
      continue;
    }
    // Le marqueur d'alignement peut précéder le titre (« [[centre]] # TITRE ») ou le suivre.
    const leading = takeAlign(line);
    const heading = HEADING.exec(leading.text);
    if (heading) {
      flush();
      const level = heading[1].length;
      const { align, text } = takeAlign(heading[2]);
      const chosen = align ?? leading.align ?? (level === 1 ? 'center' : undefined);
      out.push(`<h${level}${alignStyle(chosen)}>${inlineMarkup(text.replace(/\s+#+\s*$/, ''))}</h${level}>`);
      continue;
    }
    if (RULE_LINE.test(line)) {
      flush();
      out.push('<hr/>');
      continue;
    }
    if (TABLE_LINE.test(line)) {
      flush();
      const block: string[] = [];
      while (i < lines.length && TABLE_LINE.test(lines[i])) block.push(lines[i++]);
      i--;
      out.push(tableHtml(block));
      continue;
    }
    if (LIST_ITEM.test(line)) {
      flush();
      const ordered = Boolean(LIST_ITEM.exec(line)![1]);
      const items: string[] = [];
      while (i < lines.length) {
        const match = LIST_ITEM.exec(lines[i]);
        if (match && Boolean(match[1]) === ordered) {
          items.push(match[2]);
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          // Suite d'un élément sur la ligne suivante (indentée).
          items[items.length - 1] += `\n${lines[i].trim()}`;
        } else {
          break;
        }
        i++;
      }
      i--;
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${item.split('\n').map(inlineMarkup).join('<br/>')}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote><p>${quoted.map(inlineMarkup).join('<br/>')}</p></blockquote>`);
      continue;
    }
    const { align, text } = takeAlign(line);
    // Un changement d'alignement ouvre un nouveau paragraphe.
    if (paragraph.length && align && align !== paragraphAlign) flush();
    if (!paragraph.length) paragraphAlign = align;
    paragraph.push(text);
  }
  flush();
  return out.join('\n');
}

// ── HTML → balisage (document repris pour une modification) ─────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '‹')
    .replace(/&gt;/g, '›')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function inlineToMarkup(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
      .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, '__$1__')
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
      .replace(/<[^>]+>/g, ''),
  ).replace(/[ \t]+/g, ' ').trim();
}

function alignMarker(attributes: string): string {
  const align = /text-align\s*:\s*(center|right|justify)/i.exec(attributes)?.[1]?.toLowerCase();
  return align === 'center' ? '[[centre]] ' : align === 'right' ? '[[droite]] ' : align === 'justify' ? '[[justifie]] ' : '';
}

/**
 * HTML de l'éditeur → balisage, pour que l'IA reprenne le document tel que
 * l'utilisateur l'a corrigé (titres, listes, tableaux, alignements).
 */
export function htmlToMarkup(html: string): string {
  let text = String(html ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, ' ');
  text = text.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_match, inner: string) => {
    const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => ({
      header: /<th\b/i.test(row[1]),
      cells: [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => inlineToMarkup(cell[1]).replace(/\n/g, ' ').replace(/\|/g, '/')),
    }));
    const lines = rows.map((row) => `| ${row.cells.join(' | ')} |`);
    if (rows[0]?.header) lines.splice(1, 0, `|${rows[0].cells.map(() => '---').join('|')}|`);
    return `\n\n${lines.join('\n')}\n\n`;
  });
  text = text
    .replace(/<h([1-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, level: string, attrs: string, inner: string) =>
      `\n\n${'#'.repeat(Number(level))} ${level === '1' ? '' : alignMarker(attrs)}${inlineToMarkup(inner)}\n\n`)
    .replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag: string, inner: string) => {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((item, index) =>
        `${tag.toLowerCase() === 'ol' ? `${index + 1}.` : '-'} ${inlineToMarkup(item[1].replace(/<\/?p\b[^>]*>/gi, ' ')).replace(/\n/g, '\n  ')}`);
      return `\n\n${items.join('\n')}\n\n`;
    })
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner: string) =>
      `\n\n${inlineToMarkup(inner.replace(/<\/p>\s*<p\b[^>]*>/gi, '<br/>')).split('\n').map((line) => `> ${line}`).join('\n')}\n\n`)
    .replace(/<hr\b[^>]*\/?>/gi, '\n\n---\n\n')
    .replace(/<(p|div)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_m, _tag: string, attrs: string, inner: string) => {
      const content = inlineToMarkup(inner);
      return content ? `\n\n${alignMarker(attrs)}${content}\n\n` : '\n\n';
    });
  return inlineToMarkup(text.replace(/\n/g, '<br/>'))
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Variables des modèles ───────────────────────────────────────────────────

/** Variables `{{nom}}` d'un modèle, dans l'ordre (conditions `{{#if x}}` comprises). */
export function templateVariableNames(html: string): string[] {
  const names = new Set<string>();
  for (const match of String(html ?? '').matchAll(/\{\{\s*(?:#if\s+)?([\w.]+)\s*\}\}/g)) names.add(match[1]);
  return [...names];
}

const BLOCK_START = /^\s*<(p|h[1-6]|ul|ol|table|blockquote|div|hr)\b/i;

/** Texte rédigé d'un seul paragraphe sans style : son contenu, pour s'insérer dans une phrase du modèle. */
export function inlineIfSingleParagraph(html: string): string {
  const single = /^\s*<p>([\s\S]*?)<\/p>\s*$/.exec(html);
  return single && !/<\/?p\b/i.test(single[1]) ? single[1] : html;
}

/**
 * Remplace les variables connues (valeurs déjà en HTML sûr) et résout leurs
 * conditions `{{#if x}}…{{/if}}`. Les autres variables restent pour le chat,
 * qui les remplit avec la fiche et le cabinet au moment du rendu.
 */
export function fillTemplateValues(html: string, values: Record<string, string>): string {
  const known = (key: string) => Object.prototype.hasOwnProperty.call(values, key);
  // Un texte rédigé (plusieurs paragraphes) remplace le paragraphe qui ne contient que sa variable.
  let out = String(html ?? '').replace(/<p\b[^>]*>\s*\{\{\s*([\w.]+)\s*\}\}\s*<\/p>/g, (match, key: string) =>
    known(key) && BLOCK_START.test(values[key] ?? '') ? values[key] : match);
  const ifBlock = /\{\{\s*#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g;
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(ifBlock, (match, key: string, body: string) =>
      known(key) ? (String(values[key] ?? '').trim() ? body : '') : match);
    if (next === out) break;
    out = next;
  }
  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => (known(key) ? values[key] ?? '' : match));
}

// ── Réponse sectionnée de l'IA ──────────────────────────────────────────────

export interface SectionedAnswer {
  /** Champs des notes (« TITRE », « FICHIER »…), clés en majuscules sans accents. */
  fields: Record<string, string>;
  /** Listes à puces des notes (« A_VERIFIER »). */
  lists: Record<string, string[]>;
  /** Le document (ou le modèle). */
  body: string;
}

const fieldKey = (key: string) =>
  key.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

const stripFence = (text: string) => text.replace(/^\s*```[a-z]*\n/i, '').replace(/\n```\s*$/, '').trim();

/**
 * Réponse « document, puis `===NOTES===` et des champs `TITRE: …`,
 * `A_VERIFIER:` suivi de puces » : le document vient d'abord pour s'afficher
 * en direct, sans JSON (un long texte juridique y casse l'échappement).
 * L'ordre inverse (`TITRE: …` puis `===DOCUMENT===`) est aussi lu ; sans
 * séparateur, toute la réponse est le document.
 */
export function parseSectionedAnswer(text: string): SectionedAnswer {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n');
  const notes = /^\s*={2,}\s*NOTES\s*={2,}\s*$/im.exec(clean);
  const before = /^\s*={2,}\s*(DOCUMENT|MODELE|MODÈLE)\s*={2,}\s*$/im.exec(clean);
  let head = '';
  let body = clean;
  if (notes) {
    body = clean.slice(0, notes.index);
    head = clean.slice(notes.index + notes[0].length);
  } else if (before) {
    head = clean.slice(0, before.index);
    body = clean.slice(before.index + before[0].length);
  }
  body = stripFence(body.replace(/^\s*={2,}\s*(DOCUMENT|MODELE|MODÈLE)\s*={2,}\s*$/gim, ''));
  const fields: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of stripFence(head).split('\n')) {
    const field = /^\s*([A-Za-zÀ-ÿ_ ]{2,30})\s*:\s*(.*)$/.exec(line);
    if (field && !/^\s*[-•*]/.test(line)) {
      current = fieldKey(field[1]);
      fields[current] = field[2].trim();
      continue;
    }
    const item = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (item && current) (lists[current] ??= []).push(item[1].trim());
  }
  return { fields, lists, body };
}
