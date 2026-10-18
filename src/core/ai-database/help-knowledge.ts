import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Base de connaissances « aide à l'utilisation » de l'assistant.
 *
 * Chaque module/ressource est documenté dans un fichier Markdown de
 * `help-docs/` (copié dans `dist` par les assets de nest-cli.json). Quand
 * l'utilisateur demande « comment ça marche / comment créer / à quoi ça sert »,
 * l'assistant retrouve les documents pertinents ici et répond d'après eux — il
 * n'invente rien et ne réécrit pas l'application de mémoire.
 *
 * Pour documenter un nouveau module : ajouter un fichier `.md` dans
 * `help-docs/` (voir `help-docs/README.md`), aucun code à modifier.
 */

export interface HelpDoc {
  id: string;
  title: string;
  /** Mots/expressions déclencheurs (sans accents, en minuscules). */
  keywords: string[];
  /** Préfixes de routes front où ce document est le sujet par défaut. */
  paths: string[];
  /** Corps Markdown (sans l'en-tête). */
  content: string;
}

export interface HelpDocMatch {
  doc: HelpDoc;
  score: number;
}

/**
 * En développement (`nest start --watch`, assets non surveillés) la copie dans
 * `dist` peut être périmée : le dossier source, toujours à jour, est préféré
 * s'il existe. En production seule la copie de `dist` existe.
 */
function resolveDocsDir(): string | null {
  const candidates = [
    join(process.cwd(), 'src', 'core', 'ai-database', 'help-docs'),
    join(__dirname, 'help-docs'),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

let cache: HelpDoc[] | null = null;
let cacheLoadedAt = 0;
/** Hors production, les documents sont relus au plus toutes les 5 s (édition à chaud). */
const DEV_REFRESH_MS = 5000;

export function normalizeHelpText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDoc(raw: string, fallbackId: string): HelpDoc | null {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      meta[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }

  const list = (value?: string) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const content = text.slice(match[0].length).trim();
  if (!content) return null;

  return {
    id: meta.id || fallbackId,
    title: meta.title || fallbackId,
    keywords: list(meta.keywords).map(normalizeHelpText),
    paths: list(meta.paths),
    content,
  };
}

export function loadHelpDocs(): HelpDoc[] {
  const fresh =
    process.env.NODE_ENV === 'production' ||
    Date.now() - cacheLoadedAt < DEV_REFRESH_MS;
  if (cache && fresh) return cache;
  cacheLoadedAt = Date.now();
  const dir = resolveDocsDir();
  if (!dir) return (cache = []);

  cache = readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md')
    .sort()
    .map((file) =>
      parseDoc(readFileSync(join(dir, file), 'utf8'), file.slice(0, -3)),
    )
    .filter((doc): doc is HelpDoc => !!doc);
  return cache;
}

/** Sépare la question de l'utilisateur du bloc « CONTEXTE DE LA PAGE » ajouté en aval. */
export function splitPageContext(enriched: string): {
  question: string;
  pathname?: string;
} {
  const marker = enriched.indexOf('--- CONTEXTE DE LA PAGE');
  if (marker < 0) return { question: enriched };
  const pathname = /"pathname"\s*:\s*"([^"]*)"/.exec(enriched.slice(marker))?.[1];
  return { question: enriched.slice(0, marker).trim(), pathname };
}

/**
 * Une expression à plusieurs mots est bien plus discriminante qu'un mot isolé
 * (« facture » apparaît dans toute la comptabilité) : elle pèse 3, un mot 1.
 */
function keywordWeight(keyword: string): number {
  return keyword.includes(' ') ? 3 : 1;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pluriel simple toléré (« élément facturable » ↔ « éléments facturables »).
  return new RegExp(`(?:^|[^a-z0-9])${escaped}s?(?:$|[^a-z0-9])`).test(haystack);
}

export function matchHelpDocs(
  enrichedQuestion: string,
  options: { limit?: number; minScore?: number } = {},
): HelpDocMatch[] {
  const { limit = 2, minScore = 1 } = options;
  const { question, pathname } = splitPageContext(enrichedQuestion);
  const normalized = normalizeHelpText(question);
  if (!normalized) return [];

  const scored = loadHelpDocs().map((doc): HelpDocMatch => {
    let score = 0;
    for (const keyword of doc.keywords) {
      if (containsPhrase(normalized, keyword)) score += keywordWeight(keyword);
    }
    return { doc, score };
  });

  // Sans sujet explicite (« comment créer ? »), la page ouverte fait foi.
  if (pathname && scored.every((entry) => entry.score === 0)) {
    for (const entry of scored) {
      if (entry.doc.paths.some((prefix) => pathname.startsWith(prefix))) {
        entry.score = 2;
      }
    }
  }

  const ranked = scored
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];

  // Le 2e document n'est joint que s'il est presque aussi pertinent que le 1er
  // (question qui chevauche deux modules : « facture et paiement »).
  const best = ranked[0].score;
  return ranked.filter((entry) => entry.score >= best * 0.6).slice(0, limit);
}

/** Liste des sujets documentés, pour orienter l'utilisateur quand rien ne correspond. */
export function listHelpTopics(): string[] {
  return loadHelpDocs().map((doc) => doc.title);
}

export function buildHelpSystemPrompt(docs: HelpDoc[]): string {
  const documentation = docs
    .map((doc) => `=== DOCUMENTATION : ${doc.title} ===\n${doc.content}`)
    .join('\n\n');

  return `Tu es l'assistant d'aide de KabySoft, un logiciel de gestion de cabinet d'avocats. Tu expliques à l'utilisateur comment fonctionne l'application et comment y réaliser une tâche.

Règles :
- Appuie-toi UNIQUEMENT sur la documentation ci-dessous. N'invente ni bouton, ni champ, ni écran, ni règle qui n'y figure pas. Si un point demandé n'y est pas, dis-le simplement et indique ce qui est documenté.
- Réponds en français, de façon claire et détaillée : à quoi ça sert, ce qu'il faut avoir fait avant (prérequis), les étapes dans l'ordre avec le nom exact des menus et boutons, les champs obligatoires, puis ce qui se passe automatiquement ensuite et les erreurs fréquentes — dans la mesure où la question le justifie.
- Adapte la longueur à la question : une question précise reçoit une réponse ciblée, une question générale (« comment ça fonctionne ») reçoit une explication complète et structurée.
- Utilise des listes numérotées pour les procédures, du gras pour les noms de boutons et de champs.
- Ne génère jamais de SQL, ne prétends pas avoir créé ou modifié quoi que ce soit.
- Termine, si c'est pertinent, par une phrase proposant de créer l'élément directement depuis le chat si l'utilisateur donne les informations nécessaires.

${documentation}`;
}

export function buildHelpMessages(
  question: string,
  docs: HelpDoc[],
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
) {
  return [
    { role: 'system', content: buildHelpSystemPrompt(docs) },
    ...history
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: question },
  ] as any;
}

/**
 * Réponse de secours (modèle indisponible) : la documentation brute, qui est
 * écrite pour être lisible telle quelle.
 */
export function renderHelpDocsFallback(docs: HelpDoc[]): string {
  return docs.map((doc) => `## ${doc.title}\n\n${doc.content}`).join('\n\n---\n\n');
}
