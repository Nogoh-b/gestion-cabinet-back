// Mots-clés et date propre d'un document : pas de colonne, ils vivent dans
// `metadata` (`keywords: string[]`, `document_date: 'YYYY-MM-DD'`). Le
// formulaire les envoie à plat ; le chat, déjà rangés dans `metadata`.

type Metadata = Record<string, any>;

/** « contrat, preuve » ou '["contrat","preuve"]' → ['contrat', 'preuve']. */
export function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value ?? '').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      return parseKeywords(JSON.parse(text));
    } catch {
      // Liste mal formée : lue comme du texte.
    }
  }
  return [...new Set(text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))];
}

export function parseMetadata(value: unknown): Metadata | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return { ...(value as Metadata) };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Range `keywords` / `document_date` saisis à plat dans les métadonnées.
 * Un champ absent ne touche à rien ; une chaîne vide efface la valeur.
 * Renvoie `undefined` quand il n'y a rien à écrire.
 */
export function withDocumentMeta(
  metadata: unknown,
  fields: { keywords?: unknown; document_date?: unknown },
): Metadata | undefined {
  const base = parseMetadata(metadata);
  const hasKeywords = fields.keywords !== undefined;
  const hasDate = fields.document_date !== undefined;
  if (!hasKeywords && !hasDate) return base;

  const next: Metadata = { ...(base ?? {}) };
  if (hasKeywords) {
    const keywords = parseKeywords(fields.keywords);
    if (keywords.length) next.keywords = keywords;
    else delete next.keywords;
  }
  if (hasDate) {
    const date = String(fields.document_date ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) next.document_date = date;
    else delete next.document_date;
  }
  return next;
}
