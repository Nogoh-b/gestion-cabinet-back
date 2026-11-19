/**
 * Banc d'évaluation de l'assistant IA — types partagés.
 *
 * Une question est posée au vrai assistant (endpoint SSE, mêmes droits qu'un
 * utilisateur). La vérité est calculée par une requête SQL de référence sur
 * les données du cabinet évalué : le banc fonctionne sur la base de démo comme
 * sur une copie des données réelles.
 */

/** Nature d'une valeur attendue dans la réponse (sa façon d'être comparée). */
export type ValueKind =
  /** Texte (numéro de dossier, nom de client…), sans casse ni accents. */
  | 'text'
  /** Montant : nombre écrit « 1 250 000 », « 1 250 000,50 », « 1,25 million »… */
  | 'amount'
  /** Nombre entier (chiffres, ou « aucun », « deux »… jusqu'à douze). */
  | 'count'
  /** Date : « 05/11/2026 », « 5 novembre 2026 », « 2026-11-05 »… */
  | 'date'
  /** La colonne contient une expression régulière qui doit trouver une correspondance. */
  | 'pattern';

/** Valeurs d'une colonne de la référence qui doivent figurer dans la réponse. */
export interface MentionCheck {
  column: string;
  kind?: ValueKind;
  /** Nombre maximal de lignes vérifiées (10 par défaut). */
  max?: number;
}

export type EvalCategory =
  | 'facturation'
  | 'encaissements'
  | 'dossiers'
  | 'audiences'
  | 'actions'
  | 'suivi'
  | 'honnetete'
  | 'isolation'
  | 'routage'
  | 'competences'
  | 'references'
  | 'ambiguite'
  | 'enchainement'
  | 'briefing'
  | 'ecritures';

export interface EvalQuestion {
  id: string;
  category: EvalCategory;
  /** Description courte : ce que la question vérifie. */
  goal: string;
  /**
   * Message(s) envoyés. Plusieurs messages = une conversation : les
   * vérifications portent sur la dernière réponse. `{param}` est remplacé par
   * la colonne de même nom de `pick`.
   */
  ask: string | string[];
  /**
   * Paramètres tirés des données du cabinet (`:tenant` = cabinet évalué).
   * Aucune ligne : la question est ignorée (donnée absente de ce cabinet).
   */
  pick?: string;
  /** Vérité terrain (`:tenant` et `{param}` liés en paramètres SQL). */
  reference?: string;
  /**
   * Valeurs qui ne doivent JAMAIS apparaître (colonne `value`) : lignes
   * supprimées, données d'un autre cabinet…
   */
  forbidValues?: string;
  /**
   * Enregistrements joints au PREMIER message, comme le front : @mention
   * (`source: 'mention'`) ou fiche ouverte (`source: 'page'`). Requête qui
   * renvoie type, label, id (et source).
   */
  references?: string;
  /** Mode imposé par l'utilisateur (`intentMode`), « auto » par défaut. */
  mode?: 'auto' | 'read' | 'write' | 'chat' | 'knowledge' | 'help' | 'advice';
  expect: {
    /** Intentions acceptées (événement SSE `intent`). */
    intent?: string[];
    /** Compétences acceptées : au moins une doit être lancée. */
    skill?: string[];
    /**
     * La bonne réponse est une demande de précision (homonymes, cible
     * ambiguë) plutôt qu'une réponse au hasard.
     */
    clarification?: boolean;
    mentions?: MentionCheck[];
    /** Au moins une de ces expressions doit apparaître (sans casse ni accents). */
    require?: string[];
    /** Aucune de ces expressions ne doit apparaître. */
    forbid?: string[];
    /** La demande doit être soumise à confirmation (aucune écriture directe). */
    confirmation?: boolean;
    /**
     * La bonne réponse est « rien / introuvable » : si la référence est vide
     * (ou absente), la réponse doit le dire au lieu d'inventer.
     */
    absenceWhenEmpty?: boolean;
  };
  /** La question peut écrire en base : ignorée sauf `--with-writes`. */
  mutates?: boolean;
  /** Ignorée quand le cabinet évalué est l'administration globale (cabinet 1). */
  skipForGlobalTenant?: boolean;
}

export interface SseEvent {
  event: string;
  data: any;
  /** Millisecondes depuis l'envoi de la question. */
  at: number;
}

/** Ce que l'assistant a renvoyé pour un message. */
export interface TurnResult {
  question: string;
  events: SseEvent[];
  /** Texte final montré à l'utilisateur. */
  answer: string;
  intent?: string;
  /** Compétences lancées pendant l'échange. */
  skills: string[];
  /** Demande de précision : ambiguïté, clarification ou choix de mode. */
  clarification: boolean;
  firstTokenMs?: number;
  totalMs: number;
  error?: string;
  confirmation: boolean;
  conversationId?: string;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  /** 0 à 1 (une vérification partielle, ex. 4 valeurs citées sur 5). */
  score: number;
  detail?: string;
}

export interface QuestionResult {
  id: string;
  category: EvalCategory;
  goal: string;
  asked: string[];
  params: Record<string, unknown>;
  skipped?: string;
  ok: boolean;
  score: number;
  checks: CheckResult[];
  intent?: string;
  skills?: string[];
  answer: string;
  firstTokenMs?: number;
  totalMs?: number;
  /** Appels au modèle et modèle servi (journal ai_request_log, si lisible). */
  llmCalls?: number;
  model?: string;
  promptTokens?: number;
}

export interface EvalRun {
  label: string;
  startedAt: string;
  finishedAt?: string;
  apiUrl: string;
  tenantId: number;
  questions: QuestionResult[];
}
