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
  /**
   * Compétences que l'utilisateur peut lancer (outil `competence`). Sans
   * catalogue, l'agent ne fait que lire.
   */
  skills?: AgentSkill[];
}

export interface AgentSkill {
  code: string;
  label: string;
  description: string;
  targets?: string[];
}

/** L'agent passe la main à une compétence (document, message, calcul…). */
export interface AgentHandoff {
  code: string;
  /** Consigne reformulée pour la compétence (sinon la question). */
  consigne?: string;
  /** Fiche visée, en numéro métier ou nom. */
  cible?: { type: 'dossier' | 'client' | 'facture' | 'audience'; reference: string };
}

/** L'agent demande une précision, avec des choix cliquables. */
export interface AgentClarification {
  question: string;
  choix: string[];
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
  /** Une compétence prend le relais (rien n'a été rédigé par l'agent). */
  handoff?: AgentHandoff;
  /** Question posée à l'utilisateur au lieu d'une réponse. */
  clarification?: AgentClarification;
}

/** Outils qui terminent le tour : passage de main ou question à l'utilisateur. */
export const TERMINAL_TOOLS = ['competence', 'demander_precision'] as const;

const TARGET_TYPES = ['dossier', 'client', 'facture', 'audience'] as const;

function readHandoff(args: Record<string, any>, skills: AgentSkill[]): AgentHandoff | null {
  const code = typeof args.code === 'string' ? args.code.trim() : '';
  if (!skills.some((skill) => skill.code === code)) return null;
  const consigne = typeof args.consigne === 'string' && args.consigne.trim() ? args.consigne.trim().slice(0, 1500) : undefined;
  const raw = args.cible && typeof args.cible === 'object' ? args.cible : {};
  const type = TARGET_TYPES.find((t) => t === raw.type);
  const reference = typeof raw.reference === 'string' || typeof raw.reference === 'number' ? String(raw.reference).trim() : '';
  return { code, ...(consigne && { consigne }), ...(type && reference && { cible: { type, reference: reference.slice(0, 120) } }) };
}

function readClarification(args: Record<string, any>): AgentClarification | null {
  const question = typeof args.question === 'string' ? args.question.trim().slice(0, 500) : '';
  const choix = (Array.isArray(args.choix) ? args.choix : [])
    .filter((c: unknown): c is string => typeof c === 'string' && !!c.trim())
    .map((c: string) => c.trim().slice(0, 160))
    .slice(0, 6);
  return question ? { question, choix } : null;
}

/** `{ nom: "evaluer_chances", arguments: { dossier: "DOS-1" } }` → `competence`. */
export function asSkillCall(call: AgentCall, skills: AgentSkill[]): AgentCall {
  if (!skills.some((skill) => skill.code === call.name)) return call;
  const args = call.args ?? {};
  const explicit = args.cible && typeof args.cible === 'object' ? args.cible : null;
  const type = TARGET_TYPES.find((t) => typeof args[t] === 'string' || typeof args[t] === 'number');
  const cible = explicit ?? (type ? { type, reference: String(args[type]) } : undefined);
  return { name: 'competence', args: { code: call.name, ...(cible && { cible }) } };
}

/** Catalogue des compétences pour le prompt (descriptions abrégées). */
export function describeSkills(skills: AgentSkill[]): string {
  return skills
    .map((skill) => `- ${skill.code} — ${skill.label} : ${skill.description.slice(0, 140)}${skill.targets?.length ? ` [cible : ${skill.targets.join(' | ')}]` : ''}`)
    .join('\n');
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

export function buildAgentSystemPrompt(today: string, skills: AgentSkill[] = []): string {
  const year = today.slice(0, 4);
  const skillSection = skills.length
    ? `

COMPÉTENCES (outil « competence ») — pour PRODUIRE ou FAIRE quelque chose : rédiger un document, un courrier, un message
(e-mail, WhatsApp, espace client), calculer (décompte, délai), analyser (chances, chronologie, dossiers comparables),
préparer un rapport ou une convention. Lire ou compter des données n'est PAS une compétence : utilise les outils de lecture.
${describeSkills(skills)}

- competence { code: un code ci-dessus, cible?: { type: "dossier" | "client" | "facture" | "audience", reference: numéro ou nom } }
  La compétence prend le relais et produit le résultat : appelle-la SEULE, quand tu sais laquelle et sur quelle fiche.
  Choisis-la d'après le BUT de la demande, pas d'après un mot : « le document qui fixe nos honoraires » = convention_honoraires,
  « rappeler son audience au client par un message » = un message (whatsapp, message_portail ou envoyer_email), pas un rapport.
  Cible : celle que nomme la demande, sinon celle du CONTEXTE DE TRAVAIL. Si elle est introuvable ou ambiguë, cherche-la (chercher) ou demande.`
    : '';
  const clarifySection = `
- demander_precision { question: une seule question courte, choix: 2 à 5 réponses possibles, concrètes (ex. numéros de dossier avec le client) }
  Quand la demande est ambiguë (homonymes, cible manquante, but incertain) et que le contexte ne permet pas de trancher.`;
  return `Tu es l'assistant d'un cabinet d'avocats (Cameroun, OHADA). Tu réponds aux questions sur les données du cabinet
en appelant des OUTILS. Tu ne connais aucune donnée du cabinet sans outil : n'invente jamais un chiffre, un numéro, un nom ou une date.

Date du jour : ${today}. « Cette année » = du ${year}-01-01 au ${year}-12-31 ; « ce mois », « le mois dernier »,
« ce trimestre » : calcule les dates exactes. Sans période demandée, n'en mets pas.

OUTILS DISPONIBLES :
${describeTools()}${clarifySection}${skillSection}

MÉTHODE :
- Choisis l'outil le plus précis. « Fais le point / synthèse / état d'un dossier » → synthese_dossier.
  « Qui nous doit le plus ? » → debiteurs. Chiffre d'affaires, encaissé, créances → chiffres_facturation.
- Si un nom ou un numéro est approximatif ou ambigu, appelle d'abord chercher.
- Tu peux appeler plusieurs outils à la fois (${MAX_CALLS_PER_ROUND} au plus), puis d'autres au tour suivant si les résultats ne suffisent pas.
- RÉFÉRENCES (voir CONTEXTE DE TRAVAIL) : « ce dossier », « cette facture », « ce client » désignent d'abord l'élément
  mentionné (@) ou la fiche ouverte à l'écran, sinon le dossier / client / facture en cours de la conversation.
  « Ses factures », « sa prochaine audience », « dessus », « celui-ci » : le même élément en cours.
  « Le premier », « la deuxième », « le 3e » : position dans la dernière liste affichée. Utilise ces numéros tels quels.
- HOMONYMES : si chercher (ou une liste) renvoie plusieurs éléments possibles pour une question qui en vise UN seul
  (ex. deux clients « Mballa »), ne choisis pas au hasard : arrête les outils ("outils": []), la réponse demandera lequel.
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
- Plusieurs éléments correspondent alors que la question en vise un seul (homonymes) : ne choisis pas. Liste-les brièvement
  (numéro, client) et demande « Lequel voulez-vous ? ».
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
    { role: 'system', content: buildAgentSystemPrompt(input.today, input.skills ?? []) },
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
    // Un code de compétence appelé comme un outil (« evaluer_chances ») est
    // un passage de main : sa cible est déduite de ses arguments.
    const asked = (reply?.calls ?? []).map((call) => asSkillCall(call, input.skills ?? []));
    // Outil terminal (passage de main, question) : le tour s'arrête là.
    const terminal = asked.find((call) => (TERMINAL_TOOLS as readonly string[]).includes(call.name));
    if (terminal?.name === 'competence') {
      const handoff = readHandoff(terminal.args, input.skills ?? []);
      if (handoff) return { answer: '', steps, rounds: rounds + 1, handoff };
    }
    if (terminal?.name === 'demander_precision') {
      const clarification = readClarification(terminal.args);
      if (clarification) return { answer: '', steps, rounds: rounds + 1, clarification };
    }
    const calls = asked
      .filter((call) => !(TERMINAL_TOOLS as readonly string[]).includes(call.name) && !done.has(callKey(call)))
      .slice(0, MAX_CALLS_PER_ROUND);
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
