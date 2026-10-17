interface ReferenceAiResult {
  answer: string;
  changes: Array<Record<string, any>>;
  warnings: string[];
  references: string[];
  suggestions: string[];
  clarifying_question: string | null;
}

const record = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

/** Text blocks can split a JSON string mid-word; reasoning blocks are not answers. */
export function referenceReplyText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (block) =>
        record(block) &&
        ['text', 'output_text'].includes(block.type) &&
        typeof block.text === 'string',
    )
    .map((block) => block.text)
    .join('')
    .trim();
}

function normalize(value: unknown): ReferenceAiResult | null {
  if (!record(value)) return null;
  const clarification =
    typeof value.clarifying_question === 'string'
      ? value.clarifying_question.trim().slice(0, 500)
      : null;
  const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
  if (!answer && !clarification) return null;
  const changes = value.changes ?? [];
  if (
    !Array.isArray(changes) ||
    changes.length > 30 ||
    changes.some(
      (change) =>
        !record(change) ||
        typeof change.kind !== 'string' ||
        typeof change.key !== 'string' ||
        (change.values !== undefined && !record(change.values)) ||
        (change.links !== undefined && !record(change.links)) ||
        (change.active !== undefined && typeof change.active !== 'boolean'),
    )
  )
    return null;
  return {
    answer: answer || 'J’ai besoin d’une précision pour continuer.',
    changes,
    warnings: strings(value.warnings),
    references: strings(value.references),
    suggestions: strings(value.suggestions)
      .filter((entry) => entry.length <= 200)
      .slice(0, 3),
    clarifying_question: clarification || null,
  };
}

/** Remove only leading reasoning, never text inside a template or JSON string. */
function withoutReasoning(text: string): string {
  return text
    .replace(/^(?:\s*<(think|analysis)>[\s\S]*?<\/\1>\s*)+/i, '')
    .trim();
}

export function parseReferenceAiReply(
  content: unknown,
  truncated = false,
): ReferenceAiResult | null {
  if (truncated) return null;
  if (record(content)) return normalize(content);
  const text = withoutReasoning(referenceReplyText(content));
  if (!text || /^<(?:think|analysis)>/i.test(text)) return null;
  try {
    const value = JSON.parse(text);
    if (typeof value === 'string') return normalize(JSON.parse(value));
    return normalize(value);
  } catch {
    /* Locate a complete root object inside Markdown or introductory prose. */
  }
  if (text.startsWith('[')) return null;
  const candidates: ReferenceAiResult[] = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (start < 0) {
      if (char === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const result = normalize(JSON.parse(text.slice(start, index + 1)));
        if (result) candidates.push(result);
      } catch {
        /* Never repair or execute a malformed patch. */
      }
      start = -1;
    }
  }
  // An unfinished root or competing answers requires a new generation.
  return start < 0 && candidates.length === 1 ? candidates[0] : null;
}

export function referenceReplyFallback(
  content: unknown,
  truncated = false,
): ReferenceAiResult | null {
  const text = withoutReasoning(referenceReplyText(content));
  const readable = text && !/[{}<>]|```|^\[/.test(text);
  if (truncated || !readable) return null;
  return {
    answer: text + '\n\nAucune modification n’a été préparée ni appliquée.',
    changes: [],
    warnings: [],
    references: [],
    suggestions: [],
    clarifying_question: null,
  };
}

export function referenceReplyTruncated(
  metadata: Record<string, unknown> = {},
): boolean {
  const stopReason = metadata.finish_reason ?? metadata.stop_reason;
  return (
    (typeof stopReason === 'string' &&
      ['length', 'max_tokens', 'max_output_tokens'].includes(stopReason)) ||
    metadata.status === 'incomplete'
  );
}

/** Some compatible gateways explicitly reject JSON mode. Other errors must surface. */
export function referenceJsonModeUnsupported(error: unknown): boolean {
  if (!record(error)) return false;
  return (
    [400, 422, 501].includes(error.status ?? error.response?.status) &&
    /response[_ -]?format|json_object|json mode/i.test(
      String(error.message ?? ''),
    ) &&
    /unsupported|not supported|not available|unknown|unrecognized|not permitted|not allowed|invalid.*(?:parameter|field)/i.test(
      String(error.message ?? ''),
    )
  );
}
