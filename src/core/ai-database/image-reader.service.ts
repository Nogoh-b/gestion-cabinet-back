import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AiModelRouterService } from './ai-model-router.service';
import {
  OcrBlock,
  OcrWord,
  PARTIAL_READING_CONFIDENCE,
  PARTIAL_READING_RATIO,
  assembleOcrText,
  correctOcrText,
  illegibleRatio,
  readingScore,
  uncertainWords,
} from './ocr-text';
import { extractPdfJpegImages } from './pdf-images';

export type ImageReadingMethod = 'ocr' | 'vision';

export interface ImageReading {
  /** Texte lu ; vide quand l'image ne contient rien de lisible. */
  text: string;
  method: ImageReadingMethod;
  /** Pages lues pour un PDF numérisé. */
  pages?: number;
  /** OCR : mots lus avec doute, à vérifier sur l'original. */
  uncertain?: string[];
  /** OCR : confiance moyenne (0-100). */
  confidence?: number;
  /** OCR : part du texte lue avec doute (0-1). */
  illegible?: number;
  /**
   * Lecture partielle (écriture manuscrite, photo floue) : texte où les
   * passages douteux sont remplacés par « [illisible] », destiné au modèle.
   * `text` reste complet pour l'affichage.
   */
  reliableText?: string;
}

interface OcrPass {
  text: string;
  confidence: number;
  words: OcrWord[];
  blocks: OcrBlock[];
  score: number;
}

interface OcrPage {
  text: string;
  confidence: number;
  uncertain: string[];
  illegible: number;
  reliableText?: string;
}

const OCR_LANGUAGES = ['fra', 'eng'];
/** Au-delà, l'OCR ralentit sans gagner en précision ; en deçà, il rate les petits caractères. */
const OCR_MAX_SIDE = 3000;
const OCR_MIN_WIDTH = 1400;
/** Lectures simultanées (pages d'un scan, fichiers d'une même question). */
const OCR_WORKERS = Math.max(1, Math.min(Number(process.env.OCR_WORKERS) || 2, os.cpus().length - 1 || 1));
/** Sans lecture pendant ce délai, les workers OCR (≈ 150 Mo chacun) sont libérés. */
const OCR_IDLE_MS = 10 * 60_000;
/** Lecture jugée sûre : pas de passe supplémentaire. */
const SURE_CONFIDENCE = 93;
const VISION_MAX_SIDE = 2000;
const MAX_SCANNED_PAGES = 10;
/** Après un refus du fournisseur (crédit, quota, clé), l'OCR prend le relais pendant ce délai. */
const VISION_PAUSE_MS = 10 * 60_000;

/** Pages d'un scan envoyées en même temps au modèle vision. */
const VISION_CONCURRENCY = 4;

// Consigne éprouvée sur des fiches de suivi manuscrites (formulaire, tableau
// des renvois, mentions en marge) : DeepSeek Flash les restitue fidèlement.
const VISION_PROMPT = `Tu lis une image pour un cabinet d'avocats (pièce de dossier, souvent photographiée, parfois manuscrite).
Transcris fidèlement TOUT le texte visible, imprimé comme manuscrit, dans l'ordre de lecture :
- formulaire : une ligne « Libellé : valeur » par champ, valeur manuscrite comprise ;
- tableau : tableau Markdown, une ligne par ligne du document, colonnes conservées ;
- mentions en marge, texte vertical, tampons, cachets et signatures : à la fin, sous « Mentions en marge ».
Recopie dates, montants, numéros et noms propres exactement comme écrits, sans les corriger ni les compléter.
Écris [illisible] pour un mot que tu ne peux pas lire, et [?] après un mot dont tu doutes. N'invente rien.
Si l'image ne contient pas de texte, décris-la en une phrase.
Réponds uniquement avec la transcription.`;

/**
 * Lit le texte des images jointes au chat IA (photos, captures, scans) et des
 * PDF numérisés sans couche texte.
 *
 * Un modèle vision configuré lit et décrit l'image ; sinon, ou s'il échoue,
 * l'OCR local (tesseract, français + anglais) extrait le texte sans que le
 * fichier quitte le serveur.
 */
@Injectable()
export class ImageReaderService implements OnModuleDestroy {
  private readonly logger = new Logger(ImageReaderService.name);
  private readonly workers: Array<Promise<any>> = [];
  private readonly idleWorkers: any[] = [];
  private readonly waiting: Array<(worker: any) => void> = [];
  private idleTimer?: NodeJS.Timeout;
  private visionPausedUntil = 0;

  constructor(@Optional() private readonly modelRouter?: AiModelRouterService) {}

  async readImage(buffer: Buffer, filename = ''): Promise<ImageReading> {
    // Un TIFF de scanner contient souvent tout le document, une page par image.
    const meta = await this.sharp()(buffer, { failOn: 'none' }).metadata().catch(() => null);
    const pageCount = meta?.format === 'tiff' ? Math.min(meta.pages ?? 1, MAX_SCANNED_PAGES) : 1;
    if (pageCount > 1) {
      const pages = await Promise.all(Array.from({ length: pageCount }, (_, page) =>
        this.sharp()(buffer, { failOn: 'none', page }).png().toBuffer()));
      return this.readPages(pages, filename);
    }
    const vision = await this.readWithVision([buffer], filename);
    if (vision) return vision;
    const page = await this.ocrImage(buffer, filename);
    return {
      text: page.text,
      method: 'ocr',
      uncertain: page.uncertain,
      confidence: page.confidence,
      illegible: page.illegible,
      ...(page.reliableText !== undefined && { reliableText: page.reliableText }),
    };
  }

  /** `null` quand le PDF ne contient aucune page numérisée lisible (JPEG). */
  async readScannedPdf(pdf: Buffer, filename = ''): Promise<ImageReading | null> {
    const pages = extractPdfJpegImages(pdf, MAX_SCANNED_PAGES);
    return pages.length ? this.readPages(pages, filename) : null;
  }

  private async readPages(pages: Buffer[], filename: string): Promise<ImageReading> {
    // Une lecture par page, en parallèle : le modèle vision s'il y en a un
    // (manuscrit compris), sinon ou en cas d'échec l'OCR local de la page.
    const pageResults = await mapWithLimit(pages, VISION_CONCURRENCY, async (page, index) => {
      const label = `${filename} p.${index + 1}`;
      const vision = await this.readWithVision([page], label);
      return vision ? { vision: vision.text } : { ocr: await this.ocrImage(page, label) };
    });
    if (pageResults.every((page) => page.vision !== undefined)) {
      const texts = pageResults.map((page) => page.vision!);
      return {
        method: 'vision',
        pages: pages.length,
        text: pages.length > 1 ? texts.map((text, index) => `--- Page ${index + 1} ---\n${text}`).join('\n\n') : texts[0],
      };
    }
    // Lecture mixte ou OCR seul : les pages lues par le modèle vision gardent leur texte.
    const results: OcrPage[] = pageResults.map((page) => page.ocr
      ?? { text: page.vision!, confidence: 100, uncertain: [], illegible: 0 });
    const read = results.filter((page) => page.text);
    const base = {
      method: 'ocr' as const,
      pages: pages.length,
      uncertain: [...new Set(results.flatMap((page) => page.uncertain))].slice(0, 30),
      confidence: read.length ? Math.round(read.reduce((sum, page) => sum + page.confidence, 0) / read.length) : 0,
      illegible: read.length ? Math.round((read.reduce((sum, page) => sum + page.illegible, 0) / read.length) * 100) / 100 : 0,
    };
    if (!read.length) return { ...base, text: '' };
    const join = (pick: (page: OcrPage) => string) => (pages.length > 1
      ? results.map((page, index) => `--- Page ${index + 1} ---\n${pick(page) || '[aucun texte lisible]'}`).join('\n\n')
      : pick(results[0]));
    const partial = results.some((page) => page.reliableText !== undefined);
    return { ...base, text: join((page) => page.text), ...(partial && { reliableText: join((page) => page.reliableText ?? page.text) }) };
  }

  async onModuleDestroy(): Promise<void> {
    await this.terminateWorkers();
  }

  // ── Modèle vision ────────────────────────────────────────────────────────

  private async readWithVision(images: Buffer[], filename: string): Promise<ImageReading | null> {
    if (Date.now() < this.visionPausedUntil) return null;
    const vision = this.modelRouter?.getVisionModel();
    if (!vision) return null;
    const started = Date.now();
    try {
      const content: any[] = [{ type: 'text', text: VISION_PROMPT }];
      for (const image of images) {
        const jpeg = await this.sharp()(image, { failOn: 'none' })
          .rotate()
          .flatten({ background: '#ffffff' })
          .resize({ width: VISION_MAX_SIDE, height: VISION_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
        // `high` : l'image n'est pas réduite à 512 px (écriture fine, petits caractères).
        content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'high' } });
      }
      const response = await vision.model.invoke([new HumanMessage({ content })]);
      const text = cleanText(typeof response.content === 'string'
        ? response.content
        : (response.content as any[]).map((part) => part?.text ?? '').join(''));
      this.logger.log(`🖼️ « ${filename} » lu par ${vision.label} en ${Date.now() - started} ms (${text.length} car.)`);
      return text ? { text, method: 'vision' } : null;
    } catch (error) {
      const status = (error as any)?.status ?? (error as any)?.response?.status;
      if ([401, 402, 403, 404, 429].includes(Number(status))) this.visionPausedUntil = Date.now() + VISION_PAUSE_MS;
      this.logger.warn(`Lecture vision de « ${filename} » impossible (${status ?? (error as Error).message}) : OCR local.`);
      return null;
    }
  }

  // ── OCR local ────────────────────────────────────────────────────────────

  /**
   * Lecture d'une image en passes successives, la meilleure retenue (texte lu
   * avec assurance). Choix mesurés sur un banc d'images de cabinet (scans,
   * photos ombrées, captures, factures, tableaux, surlignages, tampons) :
   * 1. gris « canal le plus clair » : surlignages, tampons et encres de couleur
   *    s'effacent, le texte foncé reste (erreurs 38 % → 1 % avec un tampon) ;
   * 2. lecture hésitante : nouvelle passe à 300 dpi déclarés, qui sauve les
   *    tableaux à bordures (58 % → 0 %) mais dégrade les photos en basse
   *    résolution — d'où le choix au score plutôt qu'un réglage fixe ;
   * 3. toujours douteuse : gris classique (texte de couleur vive) ;
   * 4. presque illisible : page peut-être à l'envers, essai retourné.
   */
  private ocrImage(image: Buffer, label: string): Promise<OcrPage> {
    return this.withWorker(async (worker) => {
      const started = Date.now();
      const prepared = await this.prepareForOcr(image);
      const passes: OcrPass[] = [await this.recognize(worker, prepared.light)];
      const best = () => passes.reduce((a, b) => (b.score > a.score ? b : a));
      // Une photo sans texte : inutile d'insister.
      if (passes[0].words.length >= 3) {
        if (best().confidence < SURE_CONFIDENCE) passes.push(await this.recognize(worker, prepared.light, 300));
        if (best().confidence < 80) passes.push(await this.recognize(worker, await prepared.luma()));
        if (best().confidence < 60) {
          const turned = await this.sharp()(prepared.light).rotate(180).png().toBuffer();
          passes.push(await this.recognize(worker, turned));
        }
      }
      const chosen = best();
      const text = correctOcrText(cleanText(chosen.text));
      this.logger.log(
        `🔤 OCR « ${label} » en ${Date.now() - started} ms : ${passes.length} passe(s), passe ${passes.indexOf(chosen) + 1} retenue `
          + `(confiance ${Math.round(chosen.confidence)} %, ${text.length} car.)`,
      );
      // Quelques signes isolés : bruit de l'OCR sur une photo sans texte.
      const readable = text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3;
      const illegible = Math.round(illegibleRatio(chosen.blocks) * 100) / 100;
      const partial = illegible >= PARTIAL_READING_RATIO || chosen.confidence < PARTIAL_READING_CONFIDENCE;
      // Lecture partielle (écriture manuscrite le plus souvent) : le modèle ne
      // reçoit que le texte lu avec assurance, le reste marqué « [illisible] ».
      const reliableText = readable && partial
        ? correctOcrText(assembleOcrText(chosen.blocks, { maskDoubtful: true }))
        : undefined;
      if (reliableText !== undefined) {
        this.logger.log(`🔤 Lecture partielle de « ${label} » : ${Math.round(illegible * 100)} % du texte lu avec doute.`);
      }
      return {
        text: readable ? text : '',
        confidence: Math.round(chosen.confidence),
        uncertain: readable ? uncertainWords(chosen.words) : [],
        // Une page peu sûre est signalée partielle même si peu de mots sont masqués.
        illegible: partial ? Math.max(illegible, PARTIAL_READING_RATIO) : illegible,
        ...(reliableText !== undefined && { reliableText }),
      };
    });
  }

  private async recognize(worker: any, image: Buffer, dpi?: number): Promise<OcrPass> {
    // Chaque passe fixe tous ses réglages : un worker sert plusieurs lectures.
    await worker.setParameters({
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1',
      user_defined_dpi: dpi ? String(dpi) : '0',
    });
    // rotateAuto redresse les photos légèrement de travers.
    const { data } = await worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true });
    const words: OcrWord[] = (data?.blocks ?? []).flatMap((block: any) =>
      block.paragraphs.flatMap((paragraph: any) =>
        paragraph.lines.flatMap((line: any) =>
          line.words.map((word: any) => ({ text: word.text, confidence: word.confidence })))));
    // Texte remis dans l'ordre de lecture (lignes coupées par la mise en page recollées).
    const blocks: OcrBlock[] = data?.blocks ?? [];
    const text = blocks.length ? assembleOcrText(blocks) : data?.text ?? '';
    return { text, confidence: data?.confidence ?? 0, words, blocks, score: readingScore(words) };
  }

  /**
   * Redressée (EXIF), sur fond blanc, à une taille où les caractères se lisent.
   * Pas de normalize() : l'étirement du contraste efface le texte des scans sur
   * fond clair (page entière perdue lors des essais) ; tesseract binarise lui-même.
   * Un format que sharp ne décode pas (BMP) part tel quel à l'OCR.
   */
  private async prepareForOcr(image: Buffer): Promise<{ light: Buffer; luma: () => Promise<Buffer> }> {
    try {
      const sharp = this.sharp();
      const meta = await sharp(image, { failOn: 'none' }).metadata();
      const width = ((meta.orientation ?? 1) >= 5 ? meta.height : meta.width) ?? 0;
      const { data, info } = await sharp(image, { failOn: 'none', density: 200 })
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(width && width < OCR_MIN_WIDTH
          ? { width: OCR_MIN_WIDTH, kernel: 'lanczos3' }
          : { width: OCR_MAX_SIDE, height: OCR_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { width: w, height: h, channels } = info;
      const raw = { raw: { width: w, height: h, channels } } as const;
      // Gris = canal le plus clair de chaque pixel.
      const light = Buffer.alloc(w * h);
      for (let i = 0, j = 0; i < light.length; i++, j += channels) {
        light[i] = channels >= 3 ? Math.max(data[j], data[j + 1], data[j + 2]) : data[j];
      }
      return {
        light: await sharp(light, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer(),
        luma: () => sharp(data, raw).grayscale().png().toBuffer(),
      };
    } catch {
      return { light: image, luma: async () => image };
    }
  }

  // ── Workers OCR ──────────────────────────────────────────────────────────

  private async withWorker<T>(task: (worker: any) => Promise<T>): Promise<T> {
    const worker = await this.acquireWorker();
    try {
      const result = await task(worker);
      this.releaseWorker(worker);
      return result;
    } catch (error) {
      // Un worker en erreur n'est pas réutilisé.
      await this.discardWorker(worker);
      throw error;
    }
  }

  private async acquireWorker(): Promise<any> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const idle = this.idleWorkers.pop();
    if (idle) return idle;
    if (this.workers.length < OCR_WORKERS) {
      const created = this.createWorker();
      this.workers.push(created);
      try {
        return await created;
      } catch (error) {
        this.workers.splice(this.workers.indexOf(created), 1);
        this.logger.error(`OCR indisponible : ${(error as Error).message}`);
        throw error;
      }
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private releaseWorker(worker: any): void {
    const next = this.waiting.shift();
    if (next) return next(worker);
    this.idleWorkers.push(worker);
    if (this.idleWorkers.length === this.workers.length) {
      this.idleTimer = setTimeout(() => void this.terminateWorkers(), OCR_IDLE_MS);
      this.idleTimer.unref?.();
    }
  }

  private async discardWorker(worker: any): Promise<void> {
    const index = (await Promise.all(this.workers.map((item) => item.catch(() => null)))).indexOf(worker);
    if (index >= 0) this.workers.splice(index, 1);
    await worker?.terminate?.().catch?.(() => undefined);
    // Une lecture en attente prend un worker neuf.
    const next = this.waiting.shift();
    if (next) this.acquireWorker().then(next, () => undefined);
  }

  private async terminateWorkers(): Promise<void> {
    const workers = this.workers.splice(0);
    this.idleWorkers.splice(0);
    await Promise.all(workers.map(async (item) => (await item.catch(() => null))?.terminate?.()));
  }

  private async createWorker(): Promise<any> {
    const { createWorker } = require('tesseract.js');
    return createWorker(OCR_LANGUAGES, 1, {
      langPath: prepareLanguageData(),
      cacheMethod: 'none',
      gzip: true,
    });
  }

  private sharp(): typeof import('sharp') {
    return require('sharp');
  }
}

/**
 * Les modèles de langue sont livrés par paquet npm (un dossier par langue),
 * alors que tesseract lit un seul dossier : on les réunit une fois au démarrage.
 */
function prepareLanguageData(): string {
  const dir = path.join(os.tmpdir(), 'kabysoft-ocr', '4.0.0_best_int');
  fs.mkdirSync(dir, { recursive: true });
  for (const lang of OCR_LANGUAGES) {
    const target = path.join(dir, `${lang}.traineddata.gz`);
    if (fs.existsSync(target)) continue;
    const pkg = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
    fs.copyFileSync(path.join(pkg, '4.0.0_best_int', `${lang}.traineddata.gz`), target);
  }
  return dir;
}

/** `items.map(task)` avec au plus `limit` tâches en cours, résultats dans l'ordre. */
async function mapWithLimit<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function cleanText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
