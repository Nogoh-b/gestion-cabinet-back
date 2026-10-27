/**
 * Corrections du texte reconnu par OCR : confusions fréquentes en français
 * juridique, sans toucher au sens (les cas douteux restent tels quels).
 */

const MONTHS = 'janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre';
const ORDINAL_CONTEXT = `${MONTHS}|alinéa|alinea|article|étage|etage|trimestre|semestre|degré|degre|instance|ressort|chambre|rang|lot|janvier`;

// « ler mars », « lère instance » : l'OCR confond « 1 » et « l ».
const ORDINAL = new RegExp(String.raw`\b[lI|]\s?(er|ère|ere)\b(?=\s+(?:${ORDINAL_CONTEXT}))`, 'giu');
// Lettres prises pour des chiffres dans un nombre, une date ou une heure :
// « 25O 000 », « 12/1O/2O26 ». Seules O/o (zéro) et l/I/| (un) sont corrigées.
const NUMERIC_CHUNK = /(?<![\p{L}\d])[\dOolI|]+(?:[/.,:-][\dOolI|]+)*(?![\p{L}\d])/gu;
// Groupes de milliers d'un montant (« 2 S00 000 ») : la forme « d ddd ddd » est sans ambiguïté.
const THOUSANDS = /(?<![\p{L}\d])\d{1,3}(?: [\dOolI|SB]{3})+(?![\p{L}\d])/gu;
const THOUSANDS_DIGITS: Record<string, string> = { O: '0', o: '0', l: '1', I: '1', '|': '1', S: '5', B: '8' };
// « Article | », « art. l » : « 1 » pris pour une barre ou un « l » minuscule.
// « I » majuscule reste : ce peut être un chiffre romain (« Titre I »).
const NUMBERED = /\b(articles?|art\.|alin[ée]as?|n°|pi[èe]ce|annexe|lot)\s+[|l](?=[\s.,:;)—–-]|$)/giu;
// Ligne faite seulement de traits ou de signes : bordure de tableau ou bruit.
const NOISE_LINE = /^[\s|_~=\-—–.,:;'"`^*°¤!/\\[\](){}<>]{1,12}$/;

/**
 * Chaque groupe est corrigé si les chiffres y dominent (« 25O »), ou à égalité
 * dans une date, une heure ou un montant (« 1O » de « 12/1O/2026 », « O9:3O ») ;
 * « B2 », « Il », « 1l » isolés restent tels quels.
 */
function fixNumericChunk(chunk: string): string {
  const compound = /[/.,:-]/.test(chunk) || (chunk.match(/\d/g) ?? []).length >= 3;
  return chunk.split(/([/.,:-])/).map((part) => {
    if (!/[OolI|]/.test(part)) return part;
    const digits = (part.match(/\d/g) ?? []).length;
    const letters = part.length - digits;
    const fix = digits > letters || (digits >= 1 && digits === letters && compound);
    return fix ? part.replace(/[OolI|]/g, (char) => (char === 'O' || char === 'o' ? '0' : '1')) : part;
  }).join('');
}

export function correctOcrText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !NOISE_LINE.test(line) || !line.trim())
    .map((line) => line
      .replace(ORDINAL, (_match, suffix: string) => `1${suffix}`)
      .replace(NUMBERED, (_match, word: string) => `${word} 1`)
      .replace(THOUSANDS, (amount) => amount.replace(/[OolI|SB]/g, (char) => THOUSANDS_DIGITS[char]))
      .replace(NUMERIC_CHUNK, fixNumericChunk))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface OcrWord {
  text: string;
  confidence: number;
}

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Bloc de texte tel que tesseract le découpe : paragraphes, puis lignes positionnées. */
type OcrLine = { text: string; bbox: OcrBox; confidence?: number; words?: OcrWord[] };

export interface OcrBlock {
  paragraphs: Array<{ lines: OcrLine[] }>;
}

/**
 * Seuils mesurés sur des fiches en partie manuscrites : les lignes imprimées
 * sont lues à 79-96 %, les lignes manuscrites illisibles à 0-73 %, et un
 * fragment absurde peut avoir 50-80 % à lui seul. Le tri se fait donc d'abord
 * par ligne : une ligne douteuse ne garde que ses mots très sûrs (étiquettes).
 */
const DOUBTFUL_LINE = 75;
const DOUBTFUL_WORD = 60;
const SURE_WORD = 85;
/** Lecture partielle (écriture manuscrite, photo floue) au-delà de cette part de texte douteux… */
export const PARTIAL_READING_RATIO = 0.2;
/** … ou sous cette confiance moyenne de la page (un document imprimé lisible est au-delà de 90). */
export const PARTIAL_READING_CONFIDENCE = 85;

const hasAlnum = (text: string) => /[\p{L}\p{N}]/u.test(text);
const keepWord = (word: OcrWord, lineConfidence: number) =>
  word.confidence >= (lineConfidence >= DOUBTFUL_LINE ? DOUBTFUL_WORD : SURE_WORD);

/** Part du texte (en caractères) qui serait masquée comme illisible. */
export function illegibleRatio(blocks: OcrBlock[]): number {
  let doubtful = 0;
  let total = 0;
  for (const line of blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))) {
    for (const word of line.words ?? []) {
      const length = word.text.replace(/[^\p{L}\p{N}]/gu, '').length;
      total += length;
      if (!keepWord(word, line.confidence ?? 100)) doubtful += length;
    }
  }
  return total ? doubtful / total : 0;
}

/**
 * Ligne où les mots lus avec doute deviennent « [illisible] » : sur un
 * document en partie manuscrit, le modèle ne doit pas interpréter du bruit.
 */
function maskLine(line: OcrLine): string {
  const out: string[] = [];
  let masked = false;
  for (const word of line.words ?? []) {
    if (keepWord(word, line.confidence ?? 100)) out.push(word.text);
    else if (hasAlnum(word.text)) {
      masked = true;
      if (out[out.length - 1] !== '[illisible]') out.push('[illisible]');
    }
  }
  // Quelques signes rescapés d'une ligne illisible (« y R 2 », « de ») : du bruit.
  const kept = out.filter((word) => word !== '[illisible]').join('').replace(/[^\p{L}\p{N}]/gu, '').length;
  if ((masked || (line.confidence ?? 100) < DOUBTFUL_LINE) && kept < 4) return '[illisible]';
  // Dans un document mal lu, une ligne de deux ou trois signes isolés est écartée.
  if (kept < 4) return '';
  return out.join(' ');
}

/**
 * Texte remis dans l'ordre de lecture. Sur une photo inclinée ou ombrée,
 * tesseract coupe parfois une ligne en deux blocs et rejette la fin plus bas
 * (« et la soci » … « été BÉTON-PLUS ») : deux fragments à la même hauteur et
 * côte à côte sont recollés. Des colonnes, plus espacées, restent séparées.
 */
export function assembleOcrText(blocks: OcrBlock[], options: { maskDoubtful?: boolean } = {}): string {
  type Line = { text: string; bbox: OcrBox; block: number; paragraph: number; order: number; merged?: boolean };
  const lines: Line[] = [];
  blocks.forEach((block, b) => block.paragraphs.forEach((paragraph, p) => paragraph.lines.forEach((line) => {
    const raw = options.maskDoubtful && line.words?.length ? maskLine(line) : line.text;
    const text = raw.replace(/\s+$/, '');
    if (text.trim()) lines.push({ text, bbox: { ...line.bbox }, block: b, paragraph: p, order: lines.length });
  })));
  // Une page tournée de 90° donne des lignes verticales : elles ne sont jamais recollées.
  const horizontal = (line: Line) => line.bbox.x1 - line.bbox.x0 > line.bbox.y1 - line.bbox.y0;
  const heightOf = (line: Line) => line.bbox.y1 - line.bbox.y0;
  const sameRow = (a: Line, b: Line) =>
    Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0) >= 0.5 * Math.min(heightOf(a), heightOf(b));
  const merge = (line: Line, next: Line, separator: string) => {
    line.text += separator + next.text.trimStart();
    line.bbox = {
      x0: Math.min(line.bbox.x0, next.bbox.x0),
      y0: Math.min(line.bbox.y0, next.bbox.y0),
      x1: Math.max(line.bbox.x1, next.bbox.x1),
      y1: Math.max(line.bbox.y1, next.bbox.y1),
    };
    // La ligne recollée prend la place du fragment lu en premier.
    if (next.order < line.order) Object.assign(line, { order: next.order, block: next.block, paragraph: next.paragraph });
    next.merged = true;
  };
  // Le voisin de droite le plus proche sur la même ligne, jusqu'à `maxGap`.
  const rightNeighbour = (line: Line, maxGap: number, accept: (other: Line) => boolean) => {
    let best: Line | undefined;
    for (const other of lines) {
      if (other === line || other.merged || !horizontal(other) || !sameRow(line, other) || !accept(other)) continue;
      const gap = other.bbox.x0 - line.bbox.x1;
      if (gap < -0.5 * heightOf(line) || gap > maxGap) continue;
      if (!best || other.bbox.x0 < best.bbox.x0) best = other;
    }
    return best;
  };

  // 1. Ligne coupée en deux blocs (photo inclinée) : fragments presque jointifs.
  for (const line of lines) {
    if (line.merged || !horizontal(line)) continue;
    for (let next = rightNeighbour(line, 1.5 * heightOf(line), (other) => other.block !== line.block); next;
      next = rightNeighbour(line, 1.5 * heightOf(line), (other) => other.block !== line.block)) {
      // Coupure en plein mot (fragments collés) : pas d'espace ajoutée.
      merge(line, next, next.bbox.x0 - line.bbox.x1 < 0.25 * heightOf(line) ? '' : ' ');
    }
  }

  // 2. Formulaires et tableaux : tesseract lit toutes les étiquettes puis toutes les
  // valeurs (toutes les dates puis tous les événements). Une cellule de gauche qui
  // est une étiquette (« Dossier N° : »), un nombre ou une date, ou deux cellules
  // courtes, sont réunies avec leur voisine. Une colonne de texte suivi (lignes
  // longues des deux côtés) n'est pas concernée.
  const xs = lines.flatMap((line) => [line.bbox.x0, line.bbox.x1]);
  const pageWidth = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const isLabel = (text: string) => /[:：]$/.test(text.trim());
  const isNumber = (text: string) => /^[\d\s.,/:%€-]+$/.test(text.trim());
  const isShort = (text: string) => text.trim().length <= 24;
  for (const line of [...lines].sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
    if (line.merged || !horizontal(line)) continue;
    for (;;) {
      const next = rightNeighbour(line, 0.6 * pageWidth, (other) =>
        isLabel(line.text) || isNumber(line.text) || (isShort(line.text) && other.text.trim().length <= 40));
      if (!next) break;
      merge(line, next, isLabel(line.text) ? ' ' : ' | ');
    }
  }
  const kept = lines.filter((line) => !line.merged);
  const overlaps = (a: Line, b: Line) =>
    Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0) > 0.3 * Math.min(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0);
  // De vraies colonnes de texte (lignes longues côte à côte) gardent l'ordre de
  // tesseract, qui lit chaque colonne en entier. Sinon, l'ordre de haut en bas
  // (puis de gauche à droite sur une même ligne) est sûr.
  const prose = (line: Line) => line.text.trim().length > 40;
  const textColumns = kept.some((line, i) => prose(line) && kept.some((other, j) => i !== j && prose(other) && overlaps(line, other)));
  // Page tournée (lignes verticales) : seul tesseract connaît le sens de lecture.
  const rotated = kept.filter((line) => !horizontal(line)).length > kept.length / 2;
  if (!textColumns && !rotated) {
    kept.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    for (let start = 0; start < kept.length;) {
      let end = start + 1;
      while (end < kept.length && overlaps(kept[start], kept[end])) end++;
      const row = kept.slice(start, end).sort((a, b) => a.bbox.x0 - b.bbox.x0);
      kept.splice(start, row.length, ...row);
      start = end;
    }
    // Nouveau paragraphe : écart nettement plus grand que l'interligne habituel du document.
    const gaps = kept.slice(1).map((line, index) => line.bbox.y0 - kept[index].bbox.y1).sort((a, b) => a - b);
    // Médiane basse : avec peu de lignes, l'écart d'un paragraphe ne doit pas devenir la norme.
    const usualGap = Math.max(0, gaps[Math.floor((gaps.length - 1) / 2)] ?? 0);
    const heights = kept.map((line) => line.bbox.y1 - line.bbox.y0).sort((a, b) => a - b);
    const lineHeight = heights[Math.floor(heights.length / 2)] ?? 0;
    return collapseIllegible(kept
      .map((line, index) => {
        const previous = kept[index - 1];
        const gap = previous ? line.bbox.y0 - previous.bbox.y1 : 0;
        const newParagraph = previous && gap > Math.max(1.6 * usualGap, 0.5 * lineHeight);
        return `${newParagraph ? '\n' : ''}${line.text}`;
      })
      .join('\n'));
  }
  kept.sort((a, b) => a.order - b.order);
  return collapseIllegible(kept
    .map((line, index) => {
      const previous = kept[index - 1];
      const newParagraph = previous && (previous.block !== line.block || previous.paragraph !== line.paragraph);
      return `${newParagraph ? '\n' : ''}${line.text}`;
    })
    .join('\n'));
}

/** Plusieurs lignes illisibles de suite n'en font qu'une. */
function collapseIllegible(text: string): string {
  return text.replace(/^\[illisible\](?:\n+\[illisible\])+$/gm, '[illisible]');
}

/**
 * Mots lus avec doute (confiance faible) : affichés à vérifier sur l'original
 * et signalés au modèle. Les signes isolés n'en sont pas.
 */
export function uncertainWords(words: OcrWord[], threshold = 60, max = 30): string[] {
  const seen = new Set<string>();
  for (const word of words) {
    const text = word.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (word.confidence >= threshold || text.length < 2 || !/[\p{L}\p{N}]/u.test(text)) continue;
    seen.add(text);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * Texte lu avec assurance : sert à choisir la meilleure de plusieurs lectures
 * d'une même image (une lecture qui perd des lignes ou lit du bruit y perd).
 */
export function readingScore(words: OcrWord[]): number {
  return words.reduce((score, word) => score + (word.confidence >= 70 ? word.text.length : -word.text.length / 2), 0);
}
