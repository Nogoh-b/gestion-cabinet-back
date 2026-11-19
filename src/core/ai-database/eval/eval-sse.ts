import type { SseEvent, TurnResult } from './eval-types';

/**
 * Lecteur incrémental du flux `text/event-stream` de /api/ai-database/ask/stream
 * (`event: x\ndata: {...}\n\n`). Les morceaux reçus peuvent couper un
 * événement n'importe où : seul un bloc terminé par une ligne vide est émis.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string, at: number): SseEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const events: SseEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const parsed = parseBlock(block, at);
      if (parsed) events.push(parsed);
    }
    return events;
  }
}

function parseBlock(block: string, at: number): SseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!data.length && event === 'message') return null;
  const raw = data.join('\n');
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    // Donnée non JSON : gardée telle quelle.
  }
  return { event, data: parsed, at };
}

/**
 * Résumé d'un échange : texte final (analyse du `result`, sinon les
 * fragments `token`), intention annoncée, confirmation demandée, erreur,
 * temps jusqu'au premier mot.
 */
export function summarizeTurn(question: string, events: SseEvent[], totalMs: number): TurnResult {
  const tokens = events.filter((e) => e.event === 'token');
  const results = events.filter((e) => e.event === 'result');
  const lastResult = results[results.length - 1]?.data ?? {};
  const intentEvent = events.find((e) => e.event === 'intent');
  const confirmationEvent = events.find((e) => e.event === 'confirmation');
  const errorEvent = events.find((e) => e.event === 'error');
  const skills = [
    ...new Set(
      events
        .filter((e) => e.event === 'intent' && typeof e.data?.skill === 'string')
        .map((e) => String(e.data.skill)),
    ),
  ];
  const clarification =
    events.some((e) => e.event === 'ambiguity' || e.event === 'mode_choice' || e.event === 'clarification') ||
    !!lastResult.requiresClarification ||
    !!lastResult.requiresAmbiguityResolution ||
    !!lastResult.clarificationContext;

  const streamed = tokens.map((e) => String(e.data?.text ?? '')).join('');
  const answer = [
    typeof lastResult.analysis === 'string' && lastResult.analysis.trim() ? lastResult.analysis : streamed,
    // Plan d'écriture soumis à confirmation : son résumé est la réponse.
    confirmationEvent ? describeConfirmation(confirmationEvent.data) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const conversationId =
    lastResult.conversationId ??
    confirmationEvent?.data?.conversationId ??
    events.find((e) => e.data?.conversationId)?.data?.conversationId;

  return {
    question,
    events,
    answer,
    intent: intentEvent?.data?.type,
    skills,
    clarification,
    firstTokenMs: tokens[0]?.at ?? (results[0] ? results[0].at : undefined),
    totalMs,
    error: errorEvent ? String(errorEvent.data?.message ?? 'erreur') : undefined,
    confirmation: !!confirmationEvent,
    conversationId: conversationId ? String(conversationId) : undefined,
  };
}

function describeConfirmation(data: any): string {
  const plan = data?.plan ?? data?.writePlan ?? data;
  // Valeurs du plan (montant, numéro, date…) : vérifiables par le banc.
  const operations = (Array.isArray(plan?.operations) ? plan.operations : [])
    .map((op: any) => `${op?.operation ?? ''} ${op?.entity ?? op?.action ?? ''} ${JSON.stringify(op?.fields ?? {})}`)
    .join('\n');
  return [String(plan?.humanReadable ?? data?.message ?? ''), operations].filter(Boolean).join('\n');
}
