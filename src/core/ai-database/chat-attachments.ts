/**
 * Pièces jointes et passages cités du chat IA.
 *
 * - Une question peut citer un passage sélectionné (réponse de l'IA ou texte
 *   d'un document) : il accompagne la question sans décider de l'intention.
 * - Le texte déjà lu d'une pièce jointe revient avec les questions suivantes
 *   (`attachedDocuments`) : pas de nouvel OCR, et le document reste lisible
 *   pour les questions de suivi.
 */

/** Fichiers lus ensemble pour une même question. */
export const MAX_ANALYZED_FILES = 5;

/**
 * Multer lit le nom du fichier en latin1 : « Capture à 15h.png » arrive
 * « Capture Ã  15h.png ». On le relit en UTF-8 quand c'est un nom UTF-8 valide.
 */
export function utf8FileName(name: string): string {
  // Un nom déjà correct (ou contenant des caractères hors latin1) reste tel quel.
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

const MAX_ATTACHED_DOCUMENTS = 5;
const MAX_ATTACHED_CONTENT = 20000;

export interface AttachedDocumentInput {
  name: string;
  type?: string;
  content: string;
  /**
   * Repris automatiquement d'un message précédent : utilisé seulement si la
   * question porte sur un document. Sinon, joint explicitement (bouton
   * « Poser une question », passage cité) : toujours utilisé.
   */
  carried: boolean;
}

export function parseAttachedDocuments(raw?: string): AttachedDocumentInput[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && typeof item.content === 'string')
      .map((item) => ({
        name: String(item.name ?? 'Document').replace(/[\r\n"]/g, ' ').trim().slice(0, 200) || 'Document',
        type: typeof item.type === 'string' ? item.type.slice(0, 120) : undefined,
        content: item.content.slice(0, MAX_ATTACHED_CONTENT),
        carried: item.carried === true || item.carried === 'true',
      }))
      .filter((item) => item.content.trim().length > 0)
      .slice(0, MAX_ATTACHED_DOCUMENTS);
  } catch {
    return [];
  }
}

function normalize(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Désignent toujours une pièce ou une partie de pièce.
const DOCUMENT_PARTS = String.raw`images?|photos?|captures?|scans?|pdf|pj|passages?|extraits?|clauses?|paragraphes?|alineas?|pages?|lignes?|annexes?`;
// Désignent aussi des données du cabinet (« mes documents », « les courriers en attente ») :
// retenus seulement avec un déterminant singulier ou démonstratif (« ce contrat », « le document »).
const DOCUMENT_NOUNS = String.raw`documents?|fichiers?|pieces?|textes?|articles?|contrats?|actes?|courriers?|lettres?|jugements?|ordonnances?|arrets?|conclusions?|attestations?|signatures?|tampons?|cachets?`;
const DOCUMENT_REFERENCE = new RegExp([
  String.raw`\b(?:${DOCUMENT_PARTS})\b`,
  String.raw`\b(?:ce|cet|cette|ces|le|la|l|du|au|ma|mon|son|sa)\s+(?:${DOCUMENT_NOUNS})\b`,
  String.raw`\b(?:ci joint|piece jointe|dedans|y figure|y est|il dit|elle dit|est ecrit|est indique|est mentionne)\b`,
].join('|'));

// Mots d'un titre trop vagues pour désigner le document.
const TITLE_STOP_WORDS = new Set(['avec', 'dans', 'pour', 'sans', 'sous', 'entre', 'copie', 'scan', 'image', 'photo', 'capture', 'page', 'pages', 'document', 'fichier', 'dossier', 'dossiers', 'client', 'clients', 'cabinet']);

/** Noms qui désignent ce document précis : son nom de fichier et sa première ligne (« Facture N° 118 »). */
function titleWords(document: { name: string; content?: string }): string[] {
  const firstLine = (document.content ?? '').split('\n').find((line) => line.trim()) ?? '';
  return normalize(`${document.name.replace(/\.[a-z0-9]{2,5}$/i, '')} ${firstLine.slice(0, 120)}`)
    .split(' ')
    .filter((word) => word.length >= 4 && !/\d/.test(word) && !TITLE_STOP_WORDS.has(word));
}

/**
 * Une question de suivi porte-t-elle sur les documents déjà joints ?
 * Volontairement étroit : un faux positif enverrait une question sur les
 * données du cabinet (« combien de dossiers ouverts ? ») vers la lecture
 * du document.
 */
export function isDocumentFollowUp(question: string, documents: Array<{ name: string; content?: string }> = []): boolean {
  const text = normalize(question);
  if (!text) return false;
  if (DOCUMENT_REFERENCE.test(text)) return true;
  return documents.some((document) => {
    const base = normalize(document.name.replace(/\.[a-z0-9]{2,5}$/i, ''));
    if (base.length >= 4 && text.includes(base)) return true;
    // « la facture » quand le document joint est une facture (singulier : « ces factures » vise la base).
    const words = titleWords(document);
    return words.length > 0
      && new RegExp(String.raw`\b(?:ce|cet|cette|le|la|l|du|au|sur la|sur le)\s+(?:${words.join('|')})\b`).test(text);
  });
}

export interface QuotedPassage {
  text: string;
  source?: string;
}

export function parseQuotedPassage(text?: string, source?: string): QuotedPassage | null {
  const quote = String(text ?? '').replace(/\u0000/g, '').trim();
  if (!quote) return null;
  const label = String(source ?? '').replace(/[\r\n]/g, ' ').trim();
  return { text: quote, ...(label && { source: label }) };
}

/** Bloc ajouté à la demande : la question porte sur ce passage. */
export function formatQuotedPassage(quote: QuotedPassage): string {
  return `\n\n--- PASSAGE SÉLECTIONNÉ PAR L'UTILISATEUR${quote.source ? ` (source : ${quote.source})` : ''} ---
${quote.text}
--- FIN DU PASSAGE ---
La question porte sur ce passage : explique-le, réponds-y ou utilise-le selon la demande.`;
}
