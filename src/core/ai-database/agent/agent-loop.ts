import { parseAiJsonReply } from '../../../modules/platform/reference-data/reference-ai-reply';
import { AgentToolContext, AgentToolResult, describeTools, runAgentTool } from './agent-tools';

/**
 * Agent de lecture de l'assistant IA.
 *
 * Au lieu d'une seule requête SQL générée d'un coup, le modèle choisit des
 * outils métier (factures, chiffres, synthèse d'un dossier…), lit leurs
 * résultats, en redemande si besoin, puis la réponse est rédigée à partir de
 * ces seuls résultats. Le protocole est du JSON (comme l'assistant de la
 * plateforme) : il fonctionne avec tous les fournisseurs, appel d'outils
 * natif ou non.
 */

export interface AgentCall {
  name: string;
  args: Record<string, any>;
}

export interface AgentStep extends AgentCall {
  result: AgentToolResult;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentDeps {
  /** Appel du modèle (réponse JSON attendue). */
  decide(messages: AgentMessage[]): Promise<unknown>;
  /** Rédige la réponse finale en streaming à partir des résultats. */
  answer(input: { question: string; steps: AgentStep[]; history: string }): Promise<string>;
  /** Étape affichée dans le chat (« Lecture des factures… »). */
  status(message: string): void;
  tools: AgentToolContext;
}

export interface AgentInput {
  question: string;
  /** Contexte de la page, enregistrements mentionnés, profil. */
  context?: string;
  /** Derniers échanges de la conversation (questions de suivi). */
  history?: string;
  /** Date du jour AAAA-MM-JJ. */
  today: string;
}

export interface AgentOutcome {
  answer: string;
  steps: AgentStep[];
  rounds: number;
  /**
   * Aucun outil appelé : rien n'a été rédigé, l'appelant reprend son
   * circuit habituel (l'agent ne répond jamais sans données).
   */
  fallback?: boolean;
}

export const AGENT_MAX_ROUNDS = 4;
const MAX_CALLS_PER_ROUND = 4;
const MAX_RESULT_CHARS = 9_000;

const TOOL_LABELS: Record<string, string> = {
  chiffres_facturation: '📊 Calcul des chiffres de facturation',
  factures: '🧾 Lecture des factures',
  debiteurs: '💰 Classement des clients débiteurs',
  paiements: '💳 Lecture des paiements',
  dossiers: '📁 Lecture des dossiers',
  synthese_dossier: '📁 Synthèse du dossier',
  audiences: '⚖️ Lecture des audiences',
  actions: '✅ Lecture des actions',
  elements_a_facturer: '🧾 Éléments à facturer',
  chercher: '🔎 Recherche',
  requete_libre: '🗄️ Recherche dans les données',
  aide_application: '📘 Guide de l’application',
  base_juridique: '📚 Base juridique',
};

export function buildAgentSystemPrompt(today: string): string {
  const year = today.slice(0, 4);
  return `Tu es l'assistant d'un cabinet d'avocats (Cameroun, OHADA). Tu réponds aux questions sur les données du cabinet
en appelant des OUTILS. Tu ne connais aucune donnée du cabinet sans outil : n'invente jamais un chiffre, un numéro, un nom ou une date.

Date du jour : ${today}. « Cette année » = du ${year}-01-01 au ${year}-12-31 ; « ce mois », « le mois dernier »,
« ce trimestre » : calcule les dates exactes. Sans période demandée, n'en mets pas.

OUTILS DISPONIBLES :
${describeTools()}

MÉTHODE :
- Choisis l'outil le plus précis. « Fais le point / synthèse / état d'un dossier » → synthese_dossier.
  « Qui nous doit le plus ? » → debiteurs. Chiffre d'affaires, encaissé, créances → chiffres_facturation.
- Si un nom ou un numéro est approximatif ou ambigu, appelle d'abord chercher.
- Tu peux appeler plusieurs outils à la fois (${MAX_CALLS_PER_ROUND} au plus), puis d'autres au tour suivant si les résultats ne suffisent pas.
- Question de suivi (« et ses factures ? », « celui-ci ») : reprends le dossier, le client ou la facture des échanges précédents.
- requete_libre seulement si aucun autre outil ne convient.
- Dès que les résultats permettent de répondre (ou montrent qu'il n'y a rien), arrête : renvoie "outils": [].
- Si les outils que tu demandes suffiront à coup sûr (cas le plus courant : une question, un outil), ajoute "repondre": true
  pour passer directement à la réponse sans nouveau tour.

RÉPONDS UNIQUEMENT avec un objet JSON, sans texte autour :
{"outils": [{"nom": "debiteurs", "arguments": {}}], "repondre": true}
{"outils": [{"nom": "chercher", "arguments": {"texte": "Mballa"}}]}   (tu veux voir le résultat avant de continuer)
{"outils": []}   (tu as ce qu'il faut)`;
}

/** Instruction de rédaction de la réponse finale (après les outils). */
export function buildAgentAnswerRules(): string {
  return `RÈGLES DE RÉPONSE :
- Réponds à la question en t'appuyant UNIQUEMENT sur les résultats des outils ci-dessous. Aucun chiffre, numéro, nom ou date qui n'y figure pas.
- Résultat vide (nombre 0, lignes vides, « introuvable ») : dis clairement qu'il n'y a rien ou que l'élément n'existe pas dans le cabinet.
- Résultat « erreur » : dis que cette partie n'a pas pu être consultée (ce n'est PAS une absence de données).
- Montants : séparateur de milliers et devise (ex. 1 250 000 FCFA). Dates au format JJ/MM/AAAA.
- Cite les numéros métier (dossier, facture) et les noms ; jamais d'identifiant technique.
- Une facture annulée ne doit rien ; signale-la si elle est listée. Un « reste à payer » est le montant TTC moins les paiements valides.
- Sois concis et structuré (liste ou tableau Markdown si plusieurs éléments). Tu peux ajouter des repères juridiques généraux, présentés comme tels.`;
}

export interface ParsedAgentReply {
  calls: AgentCall[];
  /** Les outils demandés suffiront : réponse directe après leur exécution. */
  answerAfter?: boolean;
}

const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function normalizeReply(value: unknown): ParsedAgentReply | null {
  if (!record(value)) return null;
  const list = Array.isArray(value.outils) ? value.outils : Array.isArray(value.tools) ? value.tools : null;
  if (!list) return null;
  const calls = list
    .filter((call: unknown) => record(call) && typeof (call.nom ?? call.name) === 'string')
    .map((call: any) => ({
      name: String(call.nom ?? call.name).trim(),
      args: record(call.arguments) ? call.arguments : record(call.args) ? call.args : {},
    }));
  const answerAfter = value.repondre === true || value.final === true;
  return { calls, ...(answerAfter && calls.length && { answerAfter: true }) };
}

export function parseAgentReply(content: unknown): ParsedAgentReply | null {
  return parseAiJsonReply(content, false, normalizeReply);
}

/** Résultats bornés pour le prompt (une liste énorme ne noie pas le modèle). */
export function renderStepResults(steps: AgentStep[]): string {
  return steps
    .map((step) => {
      const json = JSON.stringify(step.result);
      const body = json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…(tronqué)` : json;
      return `### ${step.name} ${JSON.stringify(step.args)}\n${body}`;
    })
    .join('\n\n');
}

const callKey = (call: AgentCall) => `${call.name}:${JSON.stringify(call.args)}`;

export async function runAgent(input: AgentInput, deps: AgentDeps): Promise<AgentOutcome> {
  const messages: AgentMessage[] = [
    { role: 'system', content: buildAgentSystemPrompt(input.today) },
    {
      role: 'user',
      content: [
        input.history ? `ÉCHANGES PRÉCÉDENTS :\n${input.history}` : '',
        input.context ? `CONTEXTE :\n${input.context}` : '',
        `QUESTION : ${input.question}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
  const steps: AgentStep[] = [];
  const done = new Set<string>();
  let rounds = 0;

  for (; rounds < AGENT_MAX_ROUNDS; rounds++) {
    let reply = parseAgentReply(await deps.decide(messages));
    if (!reply && rounds === 0) {
      // Une seule relance : un modèle bavard reçoit la consigne du format.
      reply = parseAgentReply(
        await deps.decide([
          ...messages,
          { role: 'user', content: 'Réponds uniquement avec l’objet JSON {"outils": [...]} demandé.' },
        ]),
      );
    }
    const calls = (reply?.calls ?? []).filter((call) => !done.has(callKey(call))).slice(0, MAX_CALLS_PER_ROUND);
    if (!calls.length) break;
    calls.forEach((call) => done.add(callKey(call)));
    deps.status([...new Set(calls.map((call) => TOOL_LABELS[call.name] ?? '🔎 Consultation'))].join(' · ') + '…');
    const results = await Promise.all(
      calls.map(async (call) => ({ ...call, result: await runAgentTool(call.name, call.args, deps.tools) })),
    );
    steps.push(...results);
    if (reply?.answerAfter) {
      rounds++;
      break;
    }
    messages.push(
      { role: 'assistant', content: JSON.stringify({ outils: calls.map((call) => ({ nom: call.name, arguments: call.args })) }) },
      { role: 'user', content: `RÉSULTATS :\n${renderStepResults(results)}\n\nFaut-il d'autres outils ? Réponds en JSON.` },
    );
  }

  if (!steps.length) return { answer: '', steps, rounds, fallback: true };

  deps.status('✍️ Rédaction de la réponse…');
  const answer = await deps.answer({ question: input.question, steps, history: input.history ?? '' });
  return { answer, steps, rounds };
}
