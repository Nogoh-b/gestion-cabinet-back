// src/core/ai-database/recommended-actions.ts
import type { AiSkillCatalogItem, AiSkillFollowUp, AiSkillTargetType } from './skills/ai-skill.types';
import { canonicalTargetType, parseLlmJson } from './skills/skill-helpers';

/**
 * Actions recommandées sous chaque réponse du chat (2026-10-21) : compétences,
 * écritures ou lectures utiles pour la suite, la plus utile d'abord.
 *
 * Les candidats sont calculés ici sans IA : compétences permises à
 * l'utilisateur (catalogue déjà filtré par droits et plan) qui visent les
 * fiches de la réponse, suites prévues par la compétence, actions du cabinet.
 * Un appel rapide au modèle choisit ensuite 3 ou 4 candidats et rédige leur
 * libellé et leur consigne ; il ne peut ni inventer une compétence ni viser
 * une fiche absente du contexte. Sans réponse du modèle, les libellés par
 * défaut sont gardés.
 */

export interface RecommendedAction {
  id: string;
  /** Libellé du bouton, impératif, qui nomme la fiche. */
  label: string;
  /** Consigne complète envoyée au clic. */
  prompt: string;
  kind: 'skill' | 'write' | 'read';
  skill?: string;
  skillParams?: Record<string, unknown>;
  intentMode?: 'read' | 'write';
  /** Fiches jointes à la demande (identifiants : la cible est certaine). */
  references?: Array<{ type: string; id: number | string; label: string; href?: string }>;
  priority: number;
}

/** Fiche de la réponse (citée, mentionnée ou visée par la compétence). */
export interface ActionRecord {
  type: AiSkillTargetType;
  id: number | string;
  label: string;
  href?: string;
}

export type ActionOutcome =
  | 'answer'
  | 'plan'
  | 'document_draft'
  | 'message_draft'
  | 'write_done'
  | 'write_failed';

export interface ActionContext {
  question: string;
  /** Réponse affichée (markdown). */
  answer: string;
  /** Mode de la réponse (read, write, chat, knowledge, help, advice, skill…). */
  mode?: string;
  /** Compétence qui a produit la réponse. */
  skill?: string;
  outcome: ActionOutcome;
  records: ActionRecord[];
  /** Suites prévues par la compétence (« Relancer DOS-… ») : prioritaires. */
  followUps: AiSkillFollowUp[];
  catalog: AiSkillCatalogItem[];
}

export interface ActionCandidate extends Omit<RecommendedAction, 'priority'> {
  score: number;
}

/** Compétences utiles pour chaque type de fiche, de la plus courante à la moins courante. */
const RECORD_SKILLS: Partial<Record<AiSkillTargetType, string[]>> = {
  dossier: [
    'message_portail', 'envoyer_email', 'creer_diligence', 'programmer_audience', 'configurer_facturation',
    'rediger_document', 'etat_impayes', 'whatsapp', 'courrier', 'chronologie', 'evaluer_chances', 'export_dossier',
  ],
  client: ['envoyer_email', 'message_portail', 'whatsapp', 'etat_impayes', 'courrier'],
  facture: ['enregistrer_paiement', 'envoyer_facture', 'relancer_impayes', 'envoyer_email'],
  audience: ['compte_rendu_audience', 'reporter_audience', 'envoyer_email', 'message_portail'],
  diligence: ['envoyer_email', 'message_collaborateur'],
  employee: ['message_collaborateur'],
  document: ['traduire', 'audit_contrat', 'envoyer_email'],
};

/** Compétences du cabinet proposées sans fiche, selon le mode. */
const CABINET_SKILLS = ['etat_impayes', 'rapport_activite', 'rediger_document'];

/** Lectures utiles quand la réponse ne vise aucune fiche. */
const CABINET_READS: Array<{ label: string; prompt: string }> = [
  { label: 'Voir les audiences des 7 prochains jours', prompt: 'Liste les audiences des 7 prochains jours avec leur dossier, leur juridiction et leur heure.' },
  { label: 'Voir les diligences en retard', prompt: 'Liste les diligences en retard, avec leur dossier, leur échéance et leur responsable.' },
];

/** Écriture guidée à proposer après un échec d'écriture sur cette table. */
const GUIDED_FOR_FAILURE: Array<[RegExp, string]> = [
  [/paiement/i, 'enregistrer_paiement'],
  [/audience/i, 'programmer_audience'],
  [/diligence/i, 'creer_diligence'],
];

/** « du dossier DOS-… », « de Jean DUPONT », « de la facture FAC-… ». */
function ofRecord(record: ActionRecord): string {
  switch (record.type) {
    case 'dossier': return `du dossier ${record.label}`;
    case 'facture': return `de la facture ${record.label}`;
    case 'audience': return `de l'audience ${record.label}`;
    case 'diligence': return `de la diligence ${record.label}`;
    case 'document': return `du document « ${record.label} »`;
    default: return `de ${record.label}`;
  }
}

/** Texte par défaut d'une compétence sur une fiche (le modèle le reformule selon la réponse). */
function skillText(code: string, record: ActionRecord | undefined, label: string): { label: string; prompt: string } {
  const of = record ? ofRecord(record) : 'du cabinet';
  const name = record?.label ?? '';
  const texts: Record<string, { label: string; prompt: string }> = {
    message_portail: {
      label: `Écrire au client ${of} (espace client)`,
      prompt: `Publie un message dans l'espace client ${of} pour faire le point avec le client et lui demander les pièces manquantes éventuelles.`,
    },
    envoyer_email: {
      label: `Envoyer un e-mail au client ${of}`,
      prompt: `Rédige un e-mail au client ${of} pour faire le point sur l'avancement.`,
    },
    whatsapp: {
      label: `Préparer un WhatsApp au client ${of}`,
      prompt: `Prépare un message WhatsApp au client ${of} avec un récapitulatif des dernières actions menées.`,
    },
    creer_diligence: {
      label: `Créer une diligence ${of}`,
      prompt: `Crée une diligence ${of} pour la prochaine étape, avec son échéance.`,
    },
    programmer_audience: {
      label: `Programmer une audience ${of}`,
      prompt: `Programme une audience ${of}.`,
    },
    configurer_facturation: {
      label: `Configurer la facturation ${of}`,
      prompt: `Propose la configuration de facturation ${of} (forfait, honoraires, frais d'ouverture) d'après ses paramètres et ses pièces, puis le devis.`,
    },
    rediger_document: {
      label: record ? `Rédiger un document ${of}` : 'Rédiger un document',
      prompt: record ? `Rédige le prochain acte utile ${of} à partir de ses pièces.` : 'Rédige un document à partir des pièces jointes.',
    },
    etat_impayes: {
      label: record ? `État des impayés ${of}` : 'État des impayés du cabinet',
      prompt: record ? `Fais l'état des impayés ${of}.` : "Fais l'état des impayés du cabinet.",
    },
    rapport_activite: { label: "Rapport d'activité du mois", prompt: "Génère le rapport d'activité du mois en cours." },
    courrier: { label: `Rédiger un courrier ${of}`, prompt: `Rédige un courrier au client ${of}.` },
    chronologie: { label: `Chronologie ${of}`, prompt: `Établis la chronologie ${of} à partir de ses pièces.` },
    evaluer_chances: { label: `Évaluer les chances ${of}`, prompt: `Évalue les chances de succès ${of}.` },
    export_dossier: { label: `Exporter le dossier ${name}`, prompt: `Exporte le dossier ${name} en ZIP.` },
    enregistrer_paiement: {
      label: `Enregistrer un paiement sur ${name}`,
      prompt: `Enregistre un paiement reçu sur la facture ${name}.`,
    },
    envoyer_facture: { label: `Envoyer la facture ${name}`, prompt: `Envoie la facture ${name} au client par e-mail.` },
    relancer_impayes: { label: `Relancer les impayés ${of}`, prompt: `Relance le client pour les impayés ${of}.` },
    compte_rendu_audience: { label: `Compte rendu ${of}`, prompt: `Fais le compte rendu ${of} pour le client.` },
    reporter_audience: { label: `Reporter l'audience ${name}`, prompt: `Reporte l'audience ${name} à une nouvelle date.` },
    message_collaborateur: { label: `Écrire à ${name}`, prompt: `Envoie un message interne à ${name}.` },
    traduire: { label: `Traduire ${of}`, prompt: `Traduis en anglais le contenu ${of} en gardant sa mise en forme.` },
    audit_contrat: { label: `Auditer ${of}`, prompt: `Audite le contrat ${of} et repère les clauses risquées.` },
  };
  return texts[code] ?? { label: record ? `${label} · ${record.label}` : label, prompt: `${label}${record ? ` ${of}` : ''}.` };
}

function referenceOf(record: ActionRecord) {
  return { type: record.type, id: record.id, label: record.label, ...(record.href && { href: record.href }) };
}

/** Fiches de la réponse, sans doublon, du type connu des compétences. */
export function actionRecords(
  items: Array<{ type?: string; entity?: string; id?: unknown; label?: string; href?: string }>,
): ActionRecord[] {
  const out: ActionRecord[] = [];
  for (const item of items) {
    const type = canonicalTargetType(item.type) ?? canonicalTargetType(item.entity);
    const id = item.id;
    if (!type || id === undefined || id === null || id === '') continue;
    if (out.some((record) => record.type === type && String(record.id) === String(id))) continue;
    out.push({ type, id: id as number | string, label: String(item.label ?? `#${id}`).slice(0, 120), ...(item.href && { href: item.href }) });
  }
  return out;
}

/** Candidats possibles, du plus probable au moins probable. */
export function buildActionCandidates(ctx: ActionContext): ActionCandidate[] {
  const byCode = new Map(ctx.catalog.map((item) => [item.code, item]));
  const candidates: ActionCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: Omit<ActionCandidate, 'id'>) => {
    const key = `${candidate.skill ?? candidate.kind}:${candidate.references?.map((ref) => `${ref.type}#${ref.id}`).join(',') ?? ''}:${candidate.skill ? '' : candidate.prompt}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ ...candidate, id: `c${candidates.length + 1}` });
  };

  // 1. Suites prévues par la compétence.
  ctx.followUps.forEach((followUp, index) => {
    if (!byCode.has(followUp.skill)) return;
    push({
      kind: 'skill',
      skill: followUp.skill,
      label: followUp.label,
      prompt: followUp.question,
      ...(followUp.params && { skillParams: followUp.params }),
      ...(followUp.reference && { references: [{ type: followUp.reference.type, id: followUp.reference.id, label: followUp.reference.label, ...(followUp.reference.href && { href: followUp.reference.href }) }] }),
      score: 100 - index,
    });
  });

  // 2. Écriture refusée : la compétence guidée de la même table.
  if (ctx.outcome === 'write_failed') {
    for (const [pattern, code] of GUIDED_FOR_FAILURE) {
      const skill = byCode.get(code);
      if (!skill || !pattern.test(ctx.answer)) continue;
      const record = ctx.records.find((item) => skill.targets.includes(item.type));
      const text = skillText(code, record, skill.label);
      push({
        kind: 'skill',
        skill: code,
        label: text.label,
        prompt: `${ctx.question}`.trim() || text.prompt,
        ...(record && { skillParams: { target: referenceOf(record) }, references: [referenceOf(record)] }),
        score: 95,
      });
    }
  }

  // 3. Compétences qui visent les fiches de la réponse (les 3 premières).
  ctx.records.slice(0, 3).forEach((record, recordIndex) => {
    (RECORD_SKILLS[record.type] ?? []).forEach((code, skillIndex) => {
      const skill = byCode.get(code);
      if (!skill || !skill.targets.includes(record.type)) return;
      // La compétence qui vient de répondre ne se repropose pas sur la même fiche.
      if (code === ctx.skill) return;
      const text = skillText(code, record, skill.label);
      push({
        kind: 'skill',
        skill: code,
        label: text.label,
        prompt: text.prompt,
        skillParams: { target: referenceOf(record) },
        references: [referenceOf(record)],
        score: 80 - skillIndex * 3 - recordIndex * 6,
      });
    });
  });

  // 4. Sans fiche : compétences et lectures du cabinet.
  if (!ctx.records.length) {
    CABINET_SKILLS.forEach((code, index) => {
      const skill = byCode.get(code);
      if (!skill || code === ctx.skill) return;
      const text = skillText(code, undefined, skill.label);
      push({ kind: 'skill', skill: code, label: text.label, prompt: text.prompt, score: 40 - index });
    });
    CABINET_READS.forEach((read, index) => {
      push({ kind: 'read', intentMode: 'read', label: read.label, prompt: read.prompt, score: 30 - index });
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 12);
}

/** Libellés par défaut (le modèle n'a pas répondu) : les 3 meilleurs candidats. */
export function defaultActions(candidates: ActionCandidate[], count = 3): RecommendedAction[] {
  return candidates.slice(0, count).map(({ score: _score, ...candidate }, index) => ({ ...candidate, id: `act-${index + 1}`, priority: index + 1 }));
}

const OUTCOME_NOTES: Record<ActionOutcome, string> = {
  answer: 'La réponse est affichée.',
  plan: "Une carte attend la confirmation de l'utilisateur (Confirmer / Annuler) : propose ce qui suivra.",
  document_draft: 'Un document a été rédigé ; sa carte propose déjà Aperçu, PDF, Word, Classer dans le dossier et Envoyer par e-mail : ne les repropose pas.',
  message_draft: 'Un message WhatsApp a été préparé ; sa carte propose déjà Copier et Ouvrir WhatsApp : ne les repropose pas.',
  write_done: "L'écriture demandée a été effectuée.",
  write_failed: "L'écriture demandée a échoué : propose d'abord de la refaire autrement (compétence guidée).",
};

/** Consigne du modèle : choisir, classer et rédiger les actions. */
export function buildActionsPrompt(ctx: ActionContext, candidates: ActionCandidate[]): string {
  const records = ctx.records.length
    ? ctx.records.map((record) => `- ${record.type} « ${record.label} »`).join('\n')
    : '- (aucune fiche : la réponse concerne le cabinet)';
  const list = candidates
    .map((candidate) => `[${candidate.id}] ${candidate.kind}${candidate.skill ? ` · compétence ${candidate.skill}` : ''} · ${candidate.label} → « ${candidate.prompt} »`)
    .join('\n');
  return `Tu es l'assistant d'un cabinet d'avocats. Après chaque réponse, tu proposes à l'utilisateur 3 ou 4 actions utiles pour la suite, sous forme de boutons.

Demande de l'utilisateur : « ${ctx.question.slice(0, 800)} »
Mode de la réponse : ${ctx.mode ?? 'inconnu'}${ctx.skill ? ` (compétence ${ctx.skill})` : ''}
${OUTCOME_NOTES[ctx.outcome]}
Réponse affichée (extrait) :
"""
${ctx.answer.slice(0, 1800)}
"""
Fiches concernées :
${records}

Actions possibles (id, type, libellé et consigne par défaut) :
${list}

Règles :
- Choisis 3 ou 4 actions parmi la liste, de la plus utile à la moins utile au vu de la demande et de la réponse ; garde leur id.
- Réécris chaque libellé : verbe à l'impératif, 60 caractères au plus, qui nomme la fiche (numéro ou nom exact) et dit précisément ce qui sera fait.
- Réécris chaque consigne : une phrase complète et autonome, adaptée à la demande et à la réponse (ex. « Demande au client du dossier DOS-2026-0037 de déposer sa pièce d'identité dans son espace client. »), qui nomme la fiche telle qu'écrite ci-dessus.
- Tu peux ajouter au plus 2 actions hors liste, de type "read" (consulter des données) ou "write" (créer ou modifier un enregistrement), seulement sur les fiches ci-dessus ou sur tout le cabinet. Aucun autre numéro de fiche.
- Ne propose pas ce que la réponse vient de faire, ni deux actions qui font la même chose.

Réponds UNIQUEMENT en JSON :
{"actions": [{"id": "c1", "label": "…", "prompt": "…"}, {"kind": "read", "label": "…", "prompt": "…"}]}`;
}

/** Numéros de fiche cités (DOS-2026-0037, FAC-2026-0040…). */
const RECORD_CODE = /\b[A-Z]{2,5}-\d{4}-\d{2,6}\b/g;

function clean(text: unknown, max: number): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Actions choisies par le modèle, vérifiées : candidats existants, actions
 * libres sans numéro de fiche inconnu. `null` si la réponse est inutilisable.
 */
export function parseChosenActions(
  text: string,
  candidates: ActionCandidate[],
  ctx: ActionContext,
): RecommendedAction[] | null {
  const parsed = parseLlmJson<{ actions?: Array<Record<string, unknown>> }>(text);
  if (!parsed || !Array.isArray(parsed.actions)) return null;
  const known = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const allowedCodes = new Set(
    [ctx.question, ctx.answer, ...ctx.records.map((record) => record.label)].flatMap((value) => value.match(RECORD_CODE) ?? []),
  );
  const out: RecommendedAction[] = [];
  const used = new Set<string>();
  let free = 0;
  for (const item of parsed.actions) {
    if (out.length >= 4) break;
    const id = clean(item.id, 10);
    const label = clean(item.label, 80);
    const prompt = clean(item.prompt, 600);
    const candidate = id ? known.get(id) : undefined;
    if (candidate) {
      if (used.has(candidate.id)) continue;
      used.add(candidate.id);
      const { score: _score, ...rest } = candidate;
      out.push({
        ...rest,
        id: `act-${out.length + 1}`,
        label: label.length >= 3 ? label : candidate.label,
        prompt: prompt.length >= 8 ? prompt : candidate.prompt,
        priority: out.length + 1,
      });
      continue;
    }
    const kind = item.kind === 'write' ? 'write' : item.kind === 'read' ? 'read' : null;
    if (!kind || free >= 2 || label.length < 3 || prompt.length < 8) continue;
    // Une action libre ne vise que les fiches du contexte.
    if ((prompt.match(RECORD_CODE) ?? []).some((code) => !allowedCodes.has(code))) continue;
    const references = ctx.records.filter((record) => prompt.includes(record.label)).map(referenceOf);
    free += 1;
    out.push({
      id: `act-${out.length + 1}`,
      label,
      prompt,
      kind,
      intentMode: kind,
      ...(references.length && { references }),
      priority: out.length + 1,
    });
  }
  return out.length ? out : null;
}
