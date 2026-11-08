import {
  parseAiJsonReply,
  referenceReplyFallback,
} from '../reference-data/reference-ai-reply';

export interface PlatformAssistantReply {
  answer: string;
  tools: Array<{ name: string; args: Record<string, any> }>;
  actions: Array<{ type: unknown; cabinet_id: unknown; params: Record<string, any> }>;
  suggestions: string[];
  clarifying_question: string | null;
}

const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function normalize(value: unknown): PlatformAssistantReply | null {
  if (!record(value)) return null;
  const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
  const clarification =
    typeof value.clarifying_question === 'string' && value.clarifying_question.trim()
      ? value.clarifying_question.trim().slice(0, 500)
      : null;
  const tools = (Array.isArray(value.tools) ? value.tools : [])
    .filter((tool: any) => record(tool) && typeof tool.name === 'string')
    .map((tool: any) => ({ name: tool.name, args: record(tool.args) ? tool.args : {} }));
  if (!answer && !clarification && !tools.length) return null;
  return {
    answer,
    tools,
    actions: (Array.isArray(value.actions) ? value.actions : [])
      .filter(record)
      .map((action: any) => ({
        type: action.type,
        cabinet_id: action.cabinet_id,
        params: record(action.params) ? action.params : {},
      })),
    suggestions: (Array.isArray(value.suggestions) ? value.suggestions : [])
      .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.length <= 200)
      .slice(0, 3),
    clarifying_question: clarification,
  };
}

export function parsePlatformAssistantReply(content: unknown, truncated = false) {
  return parseAiJsonReply(content, truncated, normalize);
}

/** Réponse en texte libre d'un modèle qui ignore le JSON : jamais d'outil ni d'action. */
export function platformAssistantTextFallback(
  content: unknown,
  truncated = false,
): PlatformAssistantReply | null {
  const fallback = referenceReplyFallback(content, truncated);
  return (
    fallback && {
      answer: fallback.answer,
      tools: [],
      actions: [],
      suggestions: [],
      clarifying_question: null,
    }
  );
}
