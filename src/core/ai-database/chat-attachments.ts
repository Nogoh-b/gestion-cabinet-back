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
  return documents.some((document) => namesDocument(text, document));
}

/** La question (normalisée) désigne-t-elle ce document précis : son nom, ou un mot de son titre ? */
function namesDocument(text: string, document: { name: string; content?: string }): boolean {
  if (citesFileName(text, document)) return true;
  // « la facture » quand le document joint est une facture (singulier : « ces factures » vise la base).
  const words = titleWords(document);
  return words.length > 0
    && new RegExp(String.raw`\b(?:ce|cet|cette|le|la|l|du|au|sur la|sur le)\s+(?:${words.join('|')})\b`).test(text);
}

function citesFileName(text: string, document: { name: string }): boolean {
  const base = normalize(document.name.replace(/\.[a-z0-9]{2,5}$/i, ''));
  return base.length >= 4 && text.includes(base);
}

// La question porte sur plusieurs pièces à la fois.
const SEVERAL_DOCUMENTS = /\b(?:les deux|les trois|compare|comparer|comparaison|chaque document|tous les documents|toutes les images|ces documents|ces images|ces fichiers|ces pieces|les documents|les images|les fichiers)\b/;

/**
 * Parmi les documents de la conversation (du plus récent au plus ancien),
 * ceux qui servent à la question : ceux qu'elle nomme, sinon ceux dont elle
 * reprend les mots, sinon ceux du dernier envoi. « Compare les deux images »
 * les prend tous.
 */
export function selectFocusedDocuments<T extends { name: string; content?: string; batch?: number | null }>(
  question: string,
  documents: T[],
  limit = 5,
): T[] {
  const text = normalize(question);
  // Le nom du fichier l'emporte sur un mot du titre (« le bail » d'une annexe au bail).
  const byFileName = documents.filter((document) => citesFileName(text, document));
  const named = byFileName.length ? byFileName : documents.filter((document) => namesDocument(text, document));
  if (named.length) return named.slice(0, limit);
  if (SEVERAL_DOCUMENTS.test(text)) return documents.slice(0, limit);
  const covered = documents
    .map((document) => ({ document, ...documentCoverage(question, document.content ?? '') }))
    .filter((item) => item.matched >= 2 && item.coverage >= 0.6)
    .sort((left, right) => right.coverage - left.coverage);
  if (covered.length) return covered.slice(0, 3).map((item) => item.document);
  const latest = documents[0]?.batch;
  return documents.filter((document) => document.batch === latest).slice(0, limit);
}

/** Pourquoi un document repris sert à la question (voir documentFocus). */
export type DocumentFocusReason = 'explicit' | 'reading' | 'content' | 'previous';

// Demande de lecture ou de transcription (« li bien le contenu », « relis-le »).
const READING_REQUEST = /\b(?:lis|lit|li|lire|relis|relit|relire|transcris|transcrire|retranscris|recopie|recopier|contenu|que dit|que contient|de quoi parle|qu y a t il|il y a quoi)\b/;

// Demande sur l'ensemble des données du cabinet : jamais une question sur le document.
const DATA_REQUEST = /\b(?:combien|liste|lister|affiche|afficher|montre|montrer|mes|nos|tous les|toutes les)\b/;

// Formule de politesse courte (« bonjour, ça va ? », « merci ») : jamais une question sur le document.
const SMALL_TALK = /^(?:bonjour|bonsoir|salut|hello|coucou|merci|ok|d accord|parfait|super|top|au revoir|bonne journee|bonne soiree)\b/;

// Mots de la question qui ne disent rien de son sujet.
const QUESTION_STOP_WORDS = new Set([
  'est', 'c', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'qui', 'que', 'qu', 'les', 'des', 'une', 'aux',
  'dans', 'sur', 'pour', 'avec', 'par', 'son', 'sa', 'ses', 'leur', 'donne', 'moi', 'dis', 'peux', 'tu',
  'stp', 'svp', 'merci', 'bien', 'aussi', 'encore', 'alors', 'donc', 'elle', 'il', 'ils', 'elles', 'et', 'ou',
  'du', 'de', 'la', 'le', 'l', 'un', 'en', 'au', 'y', 'a', 'ce', 'cette', 'cet', 'ces', 'ca', 'cela',
]);

/**
 * Part des mots de la question présents dans le document : « l'adresse mail
 * du cabinet » retrouve l'en-tête « Email : … — Cabinet Francis … ». Un mot
 * long peut être contenu dans un mot du document (« mail » dans « email »).
 */
export function documentCoverage(question: string, content: string): { coverage: number; matched: number } {
  const terms = [...new Set(normalize(question).split(' '))]
    .filter((word) => word.length >= 3 && !QUESTION_STOP_WORDS.has(word));
  if (!terms.length) return { coverage: 0, matched: 0 };
  const words = new Set(normalize(content).split(' ').filter((word) => word.length >= 3));
  const longWords = [...words].filter((word) => word.length >= 5);
  const matched = terms.filter(
    (term) => words.has(term) || (term.length >= 4 && longWords.some((word) => word.includes(term))),
  ).length;
  return { coverage: matched / terms.length, matched };
}

/**
 * Un document repris d'un message précédent sert-il à cette question ?
 * - explicit : la question le désigne (« ce contrat », son nom…) ;
 * - reading : elle demande de le lire ou d'en donner le contenu ;
 * - content : ses mots se retrouvent dans le document ;
 * - previous : la réponse précédente portait sur lui et la question ne vise
 *   ni l'ensemble des données du cabinet (« je veux créer le dossier là »),
 *   ni une question de droit générale (« délais d'appel au Cameroun ? »).
 * Un numéro d'enregistrement absent du document renvoie vers la base.
 */
export function documentFocus(
  question: string,
  documents: Array<{ name: string; content?: string }>,
  context: {
    previousAnswerUsedDocument?: boolean;
    recordReference?: string | null;
    /** Question de droit générale sans lien avec le cabinet (voir isKnowledgeQuestion). */
    knowledgeQuestion?: boolean;
  } = {},
): DocumentFocusReason | null {
  if (!documents.length) return null;
  if (isDocumentFollowUp(question, documents)) return 'explicit';
  const text = normalize(question);
  if (!text) return null;
  const reference = context.recordReference ? normalize(context.recordReference) : '';
  if (reference && !documents.some((document) => normalize(document.content ?? '').includes(reference))) {
    return null;
  }
  if (DATA_REQUEST.test(text)) return null;
  if (SMALL_TALK.test(text) && text.split(' ').length <= 5) return null;
  if (READING_REQUEST.test(text)) return 'reading';
  const covered = documents.some((document) => {
    const { coverage, matched } = documentCoverage(question, document.content ?? '');
    return matched >= 2 && coverage >= 0.6;
  });
  if (covered) return 'content';
  return context.previousAnswerUsedDocument && !context.knowledgeQuestion ? 'previous' : null;
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
