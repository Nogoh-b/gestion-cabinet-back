// src/modules/ai-skills/document-markup.ts
import type { ChartSpec } from 'src/core/ai-database/chart-spec';

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
 *   de paragraphe : alignement ; `[[saut de page]]` seul : nouvelle page ;
 * - `[[legende]] texte` : légende (sous une image, un graphique, un schéma) ;
 * - `[[graphique barres | titre=… | unite=…]]`, un tableau de chiffres puis
 *   `[[/graphique]]` : graphique (barres, courbe, camembert) ;
 * - `[[schema]]`, du code Mermaid puis `[[/schema]]` : schéma (étapes,
 *   chronologie, organigramme), dessiné en image par le navigateur ;
 * - en ligne : `**gras**`, `*italique*`, `__souligné__` ;
 * - `{{variable}}` et `{{#if x}}…{{/if}}` (modèles) restent tels quels.
 *
 * Un document repris pour une modification garde ce que le balisage n'écrit
 * pas (images, couleurs, polices, retraits, tableaux fusionnés) sous forme de
 * repères (`[[image 2]]`, `[[s3]]…[[/s3]]`, `[[f4]]`, `[[tableau 1]]`) que
 * l'IA recopie : le HTML d'origine y est remis tel quel (`MarkupKeep`).
 */

type Align = 'left' | 'center' | 'right' | 'justify';

/**
 * Ce que le document repris contenait et que le balisage n'écrit pas. Le HTML
 * gardé vient du document lui-même, jamais de l'IA, qui n'en voit que les repères.
 */
export interface MarkupKeep {
  /** `[[image N]]`, `[[tableau N]]` : l'élément entier (N commence à 1). */
  blocks: string[];
  /** `[[sN]]…[[/sN]]` : balise ouvrante d'un passage mis en forme. */
  spans: Array<{ open: string; tag: string }>;
  /** `[[fN]]` : attributs d'un paragraphe, d'un titre, d'un tableau ou d'une cellule. */
  formats: Array<{ attributes: string; colgroup?: string }>;
  /** Graphiques et schémas d'origine (par leur balisage) : leur image resservie s'ils n'ont pas changé. */
  visuals: Map<string, string>;
}

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

const FORMAT_MARKER = /^\s*\[\[\s*f(\d+)\s*\]\]\s*/i;

/** Repère de format `[[fN]]` en tête de ligne (avant ou après l'alignement), retiré du texte. */
function takeLead(line: string): { align?: Align; format?: number; text: string } {
  let text = line;
  let format: number | undefined;
  const takeFormat = () => {
    const match = FORMAT_MARKER.exec(text);
    if (match) {
      format ??= Number(match[1]);
      text = text.slice(match[0].length);
    }
  };
  takeFormat();
  const aligned = takeAlign(text);
  text = aligned.text;
  takeFormat();
  return { align: aligned.align, format, text };
}

const alignStyle = (align?: Align) => (align && align !== 'left' ? ` style="text-align:${align};"` : '');

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attributeOf(attributes: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attributes);
  return match ? decodeAttribute(match[2] ?? match[3] ?? '') : null;
}

/**
 * Attributs d'une balise moins ce que le balisage écrit déjà (alignement) et
 * le bruit de l'éditeur (largeurs minimales, fusion 1×1) ; vide s'il ne reste rien.
 */
function extraAttributes(attributes: string): string {
  const out = attributes
    .replace(/\s(colspan|rowspan)\s*=\s*["']?1["']?/gi, '')
    .replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i, (_match, _quoted, double?: string, single?: string) => {
      const rules = decodeAttribute(double ?? single ?? '')
        .split(';')
        .map((rule) => rule.trim())
        .filter((rule) => rule && !/^(text-align|min-width)\s*:/i.test(rule) && !/^width\s*:\s*100%$/i.test(rule));
      return rules.length ? ` style="${escapeAttribute(rules.join('; '))}"` : '';
    })
    .trim();
  return out ? ` ${out}` : '';
}

/** Attributs gardés d'une balise, avec l'alignement voulu par le balisage. */
function formatAttributes(keep: MarkupKeep | undefined, format: number | undefined, align?: Align): string {
  const kept = format ? keep?.formats[format - 1]?.attributes ?? '' : '';
  if (!kept) return alignStyle(align);
  if (!align || align === 'left') return kept;
  return /\sstyle="/i.test(kept) ? kept.replace(/\sstyle="/i, ` style="text-align:${align}; `) : `${kept} style="text-align:${align};"`;
}

/** Texte d'une ligne : échappé, puis gras, souligné, italique. */
export function inlineMarkup(text: string): string {
  return pdfText(text)
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([^\n]*?\S)__/g, '<u>$1</u>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>')
    // `_x_` hors des mots : les variables {{date_fmt}} et noms_composés restent intacts.
    .replace(/(^|[^\w{])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w}])/g, '$1<em>$2</em>');
}

/**
 * Repères en ligne remis en HTML : passages mis en forme (refermés dans le
 * bloc même si l'IA a oublié la fin) et images. Sans document repris, ou pour
 * un repère inconnu (inventé), le repère est seulement retiré.
 */
function restoreInline(html: string, keep?: MarkupKeep): string {
  const open: number[] = [];
  const close = (ids: number[]) => ids.reverse().map((id) => `</${keep!.spans[id - 1].tag}>`).join('');
  const out = html.replace(/\[\[\s*(\/?)s(\d+)\s*\]\]|\[\[\s*image\s+(\d+)\s*\]\]/gi, (_match, closing: string, span?: string, image?: string) => {
    if (image) {
      const block = keep?.blocks[Number(image) - 1] ?? '';
      return /^<img\b/i.test(block) ? block : '';
    }
    const id = Number(span);
    if (!keep?.spans[id - 1]) return '';
    if (!closing) {
      open.push(id);
      return keep.spans[id - 1].open;
    }
    const at = open.lastIndexOf(id);
    return at < 0 ? '' : close(open.splice(at));
  });
  return out + (open.length ? close(open) : '');
}

/** Lignes d'un bloc en HTML (sauts de ligne gardés), repères remis. */
const blockInline = (lines: string[], keep?: MarkupKeep) => restoreInline(lines.map(inlineMarkup).join('<br/>'), keep);

const LIST_ITEM = /^\s*(?:[-•*]|(\d+)[.)])\s+(.*)$/;
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RULE_LINE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s*(#{1,4})\s+(.*)$/;
const PAGE_BREAK = /^\s*\[\[\s*saut de page\s*\]\]\s*$/i;
const KEPT_TABLE = /^\s*\[\[\s*tableau\s+(\d+)\s*\]\]\s*$/i;
const FORMAT_LINE = /^\s*\[\[\s*f(\d+)\s*\]\]\s*$/i;
const CAPTION = /^\s*\[\[\s*l[ée]gende\s*\]\]\s*/i;
const CHART_START = /^\s*\[\[\s*graphique\b([^\]]*)\]\]\s*$/i;
const CHART_END = /^\s*\[\[\s*\/\s*graphique\s*\]\]\s*$/i;
const DIAGRAM_START = /^\s*(?:\[\[\s*sch[ée]ma\s*\]\]|```\s*mermaid)\s*$/i;
const DIAGRAM_END = /^\s*(?:\[\[\s*\/\s*sch[ée]ma\s*\]\]|```)\s*$/i;

/** Code d'un schéma : longueur bornée (un schéma reste lisible sur une page). */
const DIAGRAM_MAX = 4000;

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/** Cellule en HTML : son repère de format (couleur de fond, largeur…) en tête. */
function cellHtml(tag: 'th' | 'td', cell: string, keep?: MarkupKeep): string {
  const { format, text } = takeLead(cell);
  return `<${tag}${formatAttributes(keep, format)}>${blockInline([text], keep)}</${tag}>`;
}

function tableHtml(lines: string[], keep?: MarkupKeep, format?: number): string {
  const separator = lines.findIndex((line) => TABLE_SEPARATOR.test(line));
  const header = separator === 1 ? tableCells(lines[0]) : null;
  const rows = lines.filter((line, index) => !TABLE_SEPARATOR.test(line) && !(header && index === 0)).map(tableCells);
  const width = Math.max(header?.length ?? 0, ...rows.map((row) => row.length));
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill('')];
  const head = header ? `<thead><tr>${pad(header).map((cell) => cellHtml('th', cell, keep)).join('')}</tr></thead>` : '';
  const body = rows.map((row) => `<tr>${pad(row).map((cell) => cellHtml('td', cell, keep)).join('')}</tr>`).join('');
  const kept = format ? keep?.formats[format - 1] : undefined;
  return `<table${kept?.attributes || ' style="width:100%;"'}>${kept?.colgroup ?? ''}${head}<tbody>${body}</tbody></table>`;
}

// ── Graphiques et schémas ───────────────────────────────────────────────────

const CHART_TYPES: Record<string, ChartSpec['type']> = {
  barres: 'bar', barre: 'bar', histogramme: 'bar', colonnes: 'bar', bar: 'bar',
  courbe: 'line', courbes: 'line', ligne: 'line', lignes: 'line', line: 'line',
  camembert: 'pie', secteurs: 'pie', secteur: 'pie', pie: 'pie',
};
const CHART_TYPE_NAMES: Record<ChartSpec['type'], string> = { bar: 'barres', line: 'courbe', pie: 'camembert' };

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Texte d'une option ou d'une cellule du bloc (sans séparateur ni crochet fermant). */
const chartText = (value: unknown) => String(value ?? '').replace(/\|/g, '/').replace(/\]\]/g, ']').replace(/\s+/g, ' ').trim();
const chartNumber = (value: string) => {
  const number = Number(String(value).replace(/[\s  ]/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
};

/** Bloc `[[graphique …]]` → graphique (null s'il n'a ni série ni ligne). */
function chartFromMarkup(options: string, lines: string[]): ChartSpec | null {
  const parts = options.split('|').map((part) => part.trim()).filter(Boolean);
  let type: ChartSpec['type'] = 'bar';
  let title = '';
  let unit = '';
  for (const part of parts) {
    const option = /^([^=]+)=(.*)$/.exec(part);
    if (!option) {
      type = CHART_TYPES[fold(part)] ?? type;
      continue;
    }
    const key = fold(option[1]);
    if (key === 'titre' || key === 'title') title = chartText(option[2]);
    else if (key === 'unite' || key === 'unit') unit = chartText(option[2]);
    else if (key === 'type') type = CHART_TYPES[fold(option[2])] ?? type;
  }
  const rows = lines.filter((line) => TABLE_LINE.test(line) && !TABLE_SEPARATOR.test(line)).map(tableCells);
  const [head, ...points] = rows;
  const series = (head ?? []).slice(1);
  if (!series.length || !points.length) return null;
  return {
    type,
    ...(title && { title }),
    ...(unit && { unit }),
    xKey: 'label',
    xLabel: chartText(head[0]) || 'Libellé',
    series: series.map((label, index) => ({ key: `s${index}`, label: chartText(label) || `Série ${index + 1}` })),
    data: points.slice(0, 60).map((point) => ({
      label: chartText(point[0]),
      ...Object.fromEntries(series.map((_label, index) => [`s${index}`, chartNumber(point[index + 1] ?? '')])),
    })),
  };
}

/** Graphique → bloc `[[graphique …]]` (ce que l'IA lit et modifie). */
function chartMarkup(spec: ChartSpec): string {
  const options = [
    CHART_TYPE_NAMES[spec.type] ?? 'barres',
    spec.title && `titre=${chartText(spec.title)}`,
    spec.unit && `unite=${chartText(spec.unit)}`,
  ].filter(Boolean).join(' | ');
  const head = [spec.xLabel || 'Libellé', ...spec.series.map((serie) => serie.label)].map(chartText);
  const rows = spec.data.map((point) => [point[spec.xKey], ...spec.series.map((serie) => point[serie.key])].map(chartText));
  return [
    `[[graphique ${options}]]`,
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '[[/graphique]]',
  ].join('\n');
}

/** Graphique d'une image de l'éditeur (`data-chart`), ramené à la forme du balisage. */
function chartOfImage(json: string): ChartSpec | null {
  try {
    const spec = JSON.parse(json) as ChartSpec;
    if (!spec || !Array.isArray(spec.series) || !Array.isArray(spec.data) || !spec.series.length) return null;
    const markup = chartMarkup(spec).split('\n');
    return chartFromMarkup(/^\[\[graphique\b([^\]]*)\]\]$/.exec(markup[0])?.[1] ?? '', markup.slice(1, -1));
  } catch {
    return null;
  }
}

/** Image centrée d'un graphique ou d'un schéma ; celle d'origine si rien n'a changé. */
function visualHtml(key: string, attributes: string, keep?: MarkupKeep): string {
  const image = keep?.visuals.get(key) ?? `<img${attributes} style="width: 75%; height: auto">`;
  return `<p style="text-align:center;">${image}</p>`;
}

function chartHtml(spec: ChartSpec, keep?: MarkupKeep): string {
  return visualHtml(
    `chart:${chartMarkup(spec)}`,
    ` data-chart="${escapeAttribute(JSON.stringify(spec))}" alt="${escapeAttribute(spec.title || 'Graphique')}"`,
    keep,
  );
}

function diagramHtml(source: string, keep?: MarkupKeep): string {
  return visualHtml(`diagram:${source}`, ` data-diagram="${escapeAttribute(source)}" alt="Schéma"`, keep);
}

// ── Balisage → HTML ─────────────────────────────────────────────────────────

/**
 * Balisage du document → HTML (seules des balises connues, texte échappé).
 * `keep` : ce que le document repris contenait, remis à la place des repères.
 */
export function documentHtml(markup: string, keep?: MarkupKeep): string {
  const lines = String(markup ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let paragraphAlign: Align | undefined;
  let paragraphFormat: number | undefined;
  // `[[fN]]` seul sur sa ligne : format du tableau qui suit.
  let tableFormat: number | undefined;

  const flush = () => {
    if (paragraph.length) out.push(`<p${formatAttributes(keep, paragraphFormat, paragraphAlign)}>${blockInline(paragraph, keep)}</p>`);
    paragraph = [];
    paragraphAlign = undefined;
    paragraphFormat = undefined;
  };
  /** Lignes jusqu'à la fin du bloc (exclue), l'index posé sur cette fin. */
  const until = (start: number, end: RegExp): { body: string[]; next: number } => {
    const body: string[] = [];
    let index = start + 1;
    while (index < lines.length && !end.test(lines[index])) body.push(lines[index++]);
    return { body, next: index };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    if (PAGE_BREAK.test(line)) {
      flush();
      out.push('<div data-page-break=""></div>');
      continue;
    }
    const keptTable = KEPT_TABLE.exec(line);
    if (keptTable) {
      flush();
      const block = keep?.blocks[Number(keptTable[1]) - 1] ?? '';
      if (/^<table\b/i.test(block)) out.push(block);
      continue;
    }
    const formatLine = FORMAT_LINE.exec(line);
    if (formatLine) {
      flush();
      tableFormat = Number(formatLine[1]);
      continue;
    }
    const chart = CHART_START.exec(line);
    if (chart) {
      flush();
      const { body, next } = until(i, CHART_END);
      i = next;
      const spec = chartFromMarkup(chart[1], body);
      if (spec) out.push(chartHtml(spec, keep));
      continue;
    }
    if (DIAGRAM_START.test(line)) {
      flush();
      const { body, next } = until(i, DIAGRAM_END);
      i = next;
      const source = body.join('\n').trim().slice(0, DIAGRAM_MAX);
      if (source) out.push(diagramHtml(source, keep));
      continue;
    }
    // Le marqueur d'alignement peut précéder le titre (« [[centre]] # TITRE ») ou le suivre.
    const leading = takeLead(line);
    if (CAPTION.test(leading.text)) {
      flush();
      const caption = blockInline([leading.text.replace(CAPTION, '')], keep);
      if (caption.trim()) out.push(`<p data-caption="" style="text-align:center;"><em>${caption}</em></p>`);
      continue;
    }
    const heading = HEADING.exec(leading.text);
    if (heading) {
      flush();
      const level = heading[1].length;
      const inner = takeLead(heading[2]);
      const chosen = inner.align ?? leading.align ?? (level === 1 ? 'center' : undefined);
      out.push(`<h${level}${formatAttributes(keep, inner.format ?? leading.format, chosen)}>${blockInline([inner.text.replace(/\s+#+\s*$/, '')], keep)}</h${level}>`);
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
      out.push(tableHtml(block, keep, tableFormat));
      tableFormat = undefined;
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
      out.push(`<${tag}>${items.map((item) => `<li>${blockInline(item.split('\n'), keep)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote><p>${blockInline(quoted, keep)}</p></blockquote>`);
      continue;
    }
    // Un changement d'alignement ou de format ouvre un nouveau paragraphe.
    if (paragraph.length && ((leading.align && leading.align !== paragraphAlign) || (leading.format && leading.format !== paragraphFormat))) flush();
    if (!paragraph.length) {
      paragraphAlign = leading.align;
      paragraphFormat = leading.format;
    }
    paragraph.push(leading.text);
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

/** Passages mis en forme (couleur, police, taille, surlignage, lien, exposant) : repères `[[sN]]…[[/sN]]`. */
const STYLED_INLINE = /<(span|mark|a|sup|sub|s|del|font)\b([^>]*)>((?:(?!<(?:span|mark|a|sup|sub|s|del|font)\b)[\s\S])*?)<\/\1>/gi;

/** Repère d'un bloc repris à part (graphique, schéma, saut de page) le temps de la conversion. */
const LATE = /⟦(\d+)⟧/g;

/**
 * HTML de l'éditeur → balisage, pour que l'IA reprenne le document tel que
 * l'utilisateur l'a corrigé (titres, listes, tableaux, alignements), avec ses
 * graphiques, schémas, légendes et sauts de page. Avec `keep`, les images et
 * la mise en forme que le balisage n'écrit pas deviennent des repères, et
 * `keep` garde leur HTML pour `documentHtml` ; sans, elles sont omises.
 */
export function readDocumentHtml(html: string, options: { keep?: boolean } = {}): { markup: string; keep: MarkupKeep } {
  const keep: MarkupKeep = { blocks: [], spans: [], formats: [], visuals: new Map() };
  const keeping = options.keep === true;
  const late: string[] = [];
  const lateBlock = (markup: string) => `<p>⟦${late.push(markup) - 1}⟧</p>`;
  const formatMarker = (attributes: string, colgroup?: string) => {
    if (!keeping) return '';
    const extra = extraAttributes(attributes);
    if (!extra && !colgroup) return '';
    keep.formats.push({ attributes: extra || ' style="width:100%;"', ...(colgroup && { colgroup }) });
    return `[[f${keep.formats.length}]] `;
  };

  // Retours à la ligne aplatis après les images : le code d'un schéma les garde.
  let text = String(html ?? '').replace(/\r\n?/g, '\n');
  // Figure d'un autre éditeur : l'image, puis sa légende.
  text = text.replace(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi, (_match, inner: string) => {
    const caption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner)?.[1];
    const body = inner.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, '');
    return `<p style="text-align:center">${body}</p>${caption ? `<p data-caption="">${caption}</p>` : ''}`;
  });
  text = text.replace(/<div\b[^>]*\bdata-page-break\b[^>]*>\s*<\/div>/gi, () => lateBlock('[[saut de page]]'));
  // Attributs entre guillemets lus en entier : le navigateur laisse « > » tel quel dans un code Mermaid (« --> »).
  text = text.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag: string) => {
    const chart = attributeOf(tag, 'data-chart');
    const spec = chart ? chartOfImage(chart) : null;
    if (spec) {
      const markup = chartMarkup(spec);
      if (keeping) keep.visuals.set(`chart:${markup}`, tag);
      return `⟦${late.push(markup) - 1}⟧`;
    }
    const diagram = attributeOf(tag, 'data-diagram')?.trim();
    if (diagram) {
      if (keeping) keep.visuals.set(`diagram:${diagram.slice(0, DIAGRAM_MAX)}`, tag);
      return `⟦${late.push(`[[schema]]\n${diagram}\n[[/schema]]`) - 1}⟧`;
    }
    if (!keeping) return '';
    keep.blocks.push(tag);
    return `[[image ${keep.blocks.length}]]`;
  });
  text = text.replace(/\n/g, ' ');
  // Passages mis en forme, du plus intérieur au plus extérieur.
  for (let pass = 0; pass < 12; pass++) {
    const next = text.replace(STYLED_INLINE, (_match, tag: string, attributes: string, inner: string) => {
      if (!keeping || !attributes.trim()) return inner;
      keep.spans.push({ open: `<${tag.toLowerCase()}${attributes}>`, tag: tag.toLowerCase() });
      const id = keep.spans.length;
      return `[[s${id}]]${inner}[[/s${id}]]`;
    });
    if (next === text) break;
    text = next;
  }
  text = text.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi, (whole: string, attributes: string, inner: string) => {
    // Cellules fusionnées : le balisage ne sait pas les écrire, le tableau est repris tel quel.
    if (keeping && /\s(colspan|rowspan)\s*=\s*["']?([2-9]|\d{2,})/i.test(inner)) {
      keep.blocks.push(whole);
      return lateBlock(`[[tableau ${keep.blocks.length}]]`);
    }
    const colgroup = /<colgroup\b[\s\S]*?<\/colgroup>/i.exec(inner)?.[0];
    const sized = colgroup && /(^|[^-])width\s*:\s*\d/i.test(colgroup) ? colgroup : undefined;
    const tableMarker = formatMarker(attributes, sized).trim();
    const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => ({
      header: /<th\b/i.test(row[1]),
      cells: [...row[1].matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)].map((cell) =>
        `${formatMarker(cell[1])}${inlineToMarkup(cell[2]).replace(/\n/g, ' ').replace(/\|/g, '/')}`),
    }));
    const lines = rows.map((row) => `| ${row.cells.join(' | ')} |`);
    if (rows[0]?.header) lines.splice(1, 0, `|${rows[0].cells.map(() => '---').join('|')}|`);
    if (tableMarker) lines.unshift(tableMarker);
    return `\n\n${lines.join('\n')}\n\n`;
  });
  text = text
    .replace(/<h([1-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, level: string, attrs: string, inner: string) =>
      `\n\n${'#'.repeat(Number(level))} ${level === '1' ? '' : alignMarker(attrs)}${formatMarker(attrs)}${inlineToMarkup(inner)}\n\n`)
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
      if (!content) return '\n\n';
      // Légende : texte sans l'italique qui la met en forme.
      if (/\sdata-caption\b/i.test(` ${attrs}`)) return `\n\n[[legende]] ${content.replace(/^\*([^*\n]+)\*$/, '$1')}\n\n`;
      return `\n\n${alignMarker(attrs)}${formatMarker(attrs)}${content}\n\n`;
    });
  const markup = inlineToMarkup(text.replace(/\n/g, '<br/>'))
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // Bloc seul sur sa ligne (son alignement ne sert plus), sinon détaché du texte.
    .replace(/^(?:\[\[(?:centre|droite|justifie|f\d+)\]\]\s*)*⟦(\d+)⟧$/gm, (_match, index: string) => late[Number(index)] ?? '')
    .replace(LATE, (_match, index: string) => `\n\n${late[Number(index)] ?? ''}\n\n`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { markup, keep };
}

/**
 * HTML → balisage seul (lecture d'un modèle ou d'une pièce) : la structure,
 * les graphiques et les schémas, sans les images ni la mise en forme.
 */
export function htmlToMarkup(html: string): string {
  return readDocumentHtml(html).markup;
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
