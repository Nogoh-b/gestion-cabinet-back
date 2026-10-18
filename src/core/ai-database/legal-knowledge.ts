export const PLATFORM_LEGAL_KNOWLEDGE_KEY = 'legal_knowledge_base_v1';

export interface LegalKnowledgeDocument {
  id: string;
  name: string;
  imported_at: string;
  size: number;
  character_count: number;
  chunks: string[];
}

export interface LegalKnowledgeStore {
  version: 1;
  documents: LegalKnowledgeDocument[];
}

export interface LegalKnowledgeMatch {
  document_id: string;
  document_name: string;
  chunk: string;
  score: number;
  /** Part des termes de la question présents dans l'extrait (0–1). */
  coverage: number;
  matched_terms: number;
}

const STOP_WORDS = new Set([
  'afin', 'ainsi', 'alors', 'avec', 'avoir', 'cette', 'comme', 'dans', 'des',
  'donc', 'elle', 'elles', 'entre', 'est', 'etre', 'faire', 'ils', 'les', 'leur',
  'leurs', 'mais', 'nous', 'pour', 'puis', 'quel', 'quelle', 'quelles', 'quels',
  'sans', 'ses', 'sont', 'sur', 'tous', 'tout', 'une', 'vous', 'aux', 'par',
  'qui', 'que', 'quoi', 'dont', 'peut', 'plus', 'moins', 'droit', 'juridique',
]);

function normalizedWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g)
    ?.filter((word) => !STOP_WORDS.has(word)) ?? [];
}

export function parseLegalKnowledgeStore(raw: unknown): LegalKnowledgeStore {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  if (!value || typeof value !== 'object') return { version: 1, documents: [] };
  const documents = Array.isArray((value as any).documents)
    ? (value as any).documents.filter(
        (document: any) =>
          document &&
          typeof document.id === 'string' &&
          typeof document.name === 'string' &&
          Array.isArray(document.chunks),
      )
    : [];
  return { version: 1, documents };
}

/** Découpage sans dépendance externe, avec chevauchement pour les articles longs. */
export function chunkLegalText(
  source: string,
  maxChars = 2400,
  overlapChars = 280,
): string[] {
  const text = source
    .replace(/\0/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return [];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + maxChars, text.length);
    if (end < text.length) {
      const candidate = text.slice(cursor, end);
      const boundary = Math.max(
        candidate.lastIndexOf('\n\n'),
        candidate.lastIndexOf('. '),
        candidate.lastIndexOf('; '),
      );
      if (boundary >= Math.floor(maxChars * 0.55)) end = cursor + boundary + 1;
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlapChars);
  }
  return chunks;
}

/** Recherche lexicale locale : rapide, déterministe et sans envoyer toute la base au LLM. */
export function rankLegalKnowledge(
  documents: LegalKnowledgeDocument[],
  question: string,
  limit = 6,
): LegalKnowledgeMatch[] {
  const terms = [...new Set(normalizedWords(question))];
  if (!terms.length) return [];

  const matches: LegalKnowledgeMatch[] = [];
  for (const document of documents) {
    document.chunks.forEach((chunk) => {
      const words = normalizedWords(chunk);
      if (!words.length) return;
      const frequencies = new Map<string, number>();
      words.forEach((word) => frequencies.set(word, (frequencies.get(word) ?? 0) + 1));
      const matchedTerms = terms.filter((term) => frequencies.has(term));
      if (!matchedTerms.length) return;
      const coverage = matchedTerms.length / terms.length;
      const occurrences = matchedTerms.reduce(
        (sum, term) => sum + Math.min(frequencies.get(term) ?? 0, 4),
        0,
      );
      const score = coverage * 10 + occurrences;
      matches.push({
        document_id: document.id,
        document_name: document.name,
        chunk,
        score,
        coverage,
        matched_terms: matchedTerms.length,
      });
    });
  }

  return matches.sort((left, right) => right.score - left.score).slice(0, limit);
}

export function renderLegalKnowledgeContext(matches: LegalKnowledgeMatch[]): string {
  if (!matches.length) return '';
  return matches
    .map(
      (match, index) =>
        `[SOURCE JURIDIQUE ${index + 1} — ${match.document_name}]\n${match.chunk}`,
    )
    .join('\n\n');
}
