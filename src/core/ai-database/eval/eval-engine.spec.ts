import { SseParser, summarizeTurn } from './eval-sse';
import {
  amountMentioned,
  bindSql,
  countMentioned,
  dateMentioned,
  extractNumbers,
  fillTemplate,
  scoreTurn,
  summarizeChecks,
  textMentioned,
} from './eval-scoring';
import { compareRuns, percentile, renderMarkdown, summarizeRun } from './eval-report';
import type { EvalQuestion, EvalRun, QuestionResult, SseEvent, TurnResult } from './eval-types';

describe('banc IA — lecture du flux SSE', () => {
  it('assemble les événements coupés n’importe où', () => {
    const parser = new SseParser();
    const raw =
      'event: intent\ndata: {"type":"READ"}\n\nevent: token\ndata: {"text":"Bon"}\n\nevent: token\ndata: {"text":"jour"}\n\n' +
      'event: result\ndata: {"analysis":"Bonjour","conversationId":"c-1"}\n\nevent: done\ndata: {}\n\n';
    const events: SseEvent[] = [];
    for (let i = 0; i < raw.length; i += 7) events.push(...parser.push(raw.slice(i, i + 7), i));
    expect(events.map((e) => e.event)).toEqual(['intent', 'token', 'token', 'result', 'done']);

    const turn = summarizeTurn('q', events, 1200);
    expect(turn.answer).toBe('Bonjour');
    expect(turn.intent).toBe('READ');
    expect(turn.conversationId).toBe('c-1');
    expect(turn.firstTokenMs).toBeDefined();
    expect(turn.confirmation).toBe(false);
  });

  it('reconnaît une demande de confirmation et une erreur', () => {
    const parser = new SseParser();
    const events = parser.push(
      'event: confirmation\ndata: {"plan":{"humanReadable":"Créer le client Paul"},"conversationId":"c-2"}\n\n' +
        'event: error\ndata: {"message":"boom"}\n\n',
      10,
    );
    const turn = summarizeTurn('q', events, 50);
    expect(turn.confirmation).toBe(true);
    expect(turn.answer).toContain('Créer le client Paul');
    expect(turn.error).toBe('boom');
    expect(turn.conversationId).toBe('c-2');
  });
});

describe('banc IA — reconnaissance des valeurs', () => {
  it('lit les montants écrits à la française', () => {
    expect(extractNumbers('Total : 1 250 000 FCFA')).toContain(1250000);
    expect(extractNumbers('Total : 1 250 000,50 XAF')).toContain(1250000.5);
    expect(extractNumbers('soit 1.250.000 F')).toContain(1250000);
    expect(extractNumbers('environ 1,25 million de FCFA')).toContain(1250000);
    expect(extractNumbers('3 M FCFA')).toContain(3000000);
    expect(extractNumbers('pendant 5 mois')).toEqual([5]);
    expect(amountMentioned('Le CA HT est de 15 450 000 FCFA.', 15450000)).toBe(true);
    expect(amountMentioned('Le CA HT est de 15 450 000 FCFA.', 15450001.2)).toBe(true);
    expect(amountMentioned('Le CA HT est de 15 450 000 FCFA.', 16000000)).toBe(false);
  });

  it('lit les nombres en lettres et les dates', () => {
    expect(countMentioned('Vous avez trois dossiers actifs.', 3)).toBe(true);
    expect(countMentioned('Aucun dossier actif.', 0)).toBe(true);
    expect(countMentioned('Vous avez 12 dossiers.', 3)).toBe(false);
    expect(dateMentioned('Audience le 05/11/2026 au TPI.', '2026-11-05')).toBe(true);
    expect(dateMentioned('Audience le 5 novembre 2026.', '2026-11-05')).toBe(true);
    expect(dateMentioned('Audience le 1er mars.', '2027-03-01')).toBe(true);
    expect(dateMentioned('Audience le 15 novembre.', '2026-11-05')).toBe(false);
    expect(textMentioned('Dossier dos-2026-0001 (Société Éléphant)', 'DOS-2026-0001')).toBe(true);
    expect(textMentioned('Société Elephant', 'Société Éléphant')).toBe(true);
  });

  it('remplit les questions et lie les paramètres SQL sans les concaténer', () => {
    expect(fillTemplate('Point sur {dossier}', { dossier: 'DOS-1' })).toBe('Point sur DOS-1');
    expect(bindSql("SELECT 1 FROM f WHERE tenant_id = :tenant AND numero = {numero} AND x = ':tenant'", { tenant: 7, numero: "A'1" }))
      .toEqual({ sql: "SELECT 1 FROM f WHERE tenant_id = ? AND numero = ? AND x = '?'", values: [7, "A'1", 7] });
    expect(() => bindSql('SELECT {absent}', { tenant: 7 })).toThrow('{absent}');
  });
});

describe('banc IA — notation', () => {
  const turn = (answer: string, extra: Partial<TurnResult> = {}): TurnResult => ({
    question: 'q', events: [], answer, totalMs: 1000, confirmation: false, intent: 'READ', ...extra,
  });
  const question = (expect: EvalQuestion['expect'], extra: Partial<EvalQuestion> = {}): EvalQuestion => ({
    id: 'q', category: 'facturation', goal: 'test', ask: 'q', reference: 'SELECT 1', expect, ...extra,
  });

  it('exige les valeurs de la référence (toutes jusqu’à 3, 80 % au-delà)', () => {
    const rows = [{ numero: 'F-1' }, { numero: 'F-2' }, { numero: 'F-3' }, { numero: 'F-4' }, { numero: 'F-5' }];
    const q = question({ intent: ['READ'], mentions: [{ column: 'numero' }] });
    const ok = summarizeChecks(scoreTurn({ question: q, turn: turn('F-1, F-2, F-3 et F-4'), referenceRows: rows }));
    expect(ok.ok).toBe(true);
    const ko = scoreTurn({ question: q, turn: turn('F-1 et F-2'), referenceRows: rows });
    expect(summarizeChecks(ko).ok).toBe(false);
    expect(ko.find((c) => c.name === 'données exactes')?.detail).toContain('2/5');
  });

  it('vérifie l’intention, les fuites et le « rien trouvé » honnête', () => {
    const q = question({ intent: ['READ'], mentions: [{ column: 'numero' }], absenceWhenEmpty: true });
    expect(summarizeChecks(scoreTurn({ question: q, turn: turn('Aucune facture impayée.'), referenceRows: [] })).ok).toBe(true);
    expect(summarizeChecks(scoreTurn({ question: q, turn: turn('Voici la facture F-9.'), referenceRows: [] })).ok).toBe(false);
    expect(summarizeChecks(scoreTurn({ question: q, turn: turn('F-1', { intent: 'HELP' }), referenceRows: [{ numero: 'F-1' }] })).ok).toBe(false);

    const leak = scoreTurn({ question: q, turn: turn('F-1 et F-AUTRE'), referenceRows: [{ numero: 'F-1' }], forbiddenValues: ['F-AUTRE'] });
    expect(leak.find((c) => c.name === 'rien d’interdit')).toMatchObject({ ok: false, detail: 'valeur F-AUTRE' });
  });

  it('vérifie la confirmation d’une écriture', () => {
    const q = question({ intent: ['WRITE'], confirmation: true }, { reference: undefined });
    expect(summarizeChecks(scoreTurn({ question: q, turn: turn('Créer ?', { intent: 'WRITE', confirmation: true }) })).ok).toBe(true);
    expect(summarizeChecks(scoreTurn({ question: q, turn: turn('Créé.', { intent: 'WRITE' }) })).ok).toBe(false);
  });
});

describe('banc IA — rapport', () => {
  const result = (id: string, ok: boolean, totalMs: number, extra: Partial<QuestionResult> = {}): QuestionResult => ({
    id, category: 'facturation', goal: 'but', asked: ['question'], params: {}, ok, score: ok ? 1 : 0.5,
    checks: ok ? [] : [{ name: 'données exactes', ok: false, score: 0.5, detail: '1/2 valeurs citées' }],
    answer: 'réponse', firstTokenMs: totalMs / 2, totalMs, llmCalls: 2, ...extra,
  });
  const run = (label: string, questions: QuestionResult[]): EvalRun => ({
    label, startedAt: '2026-11-18', apiUrl: 'http://api', tenantId: 7, questions,
  });

  it('calcule médianes et taux de réussite, ignore les questions sautées', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 90)).toBe(4);
    const s = summarizeRun(run('a', [result('a', true, 2000), result('b', false, 4000), result('c', false, 0, { skipped: 'aucune donnée' })]));
    expect(s).toMatchObject({ evaluated: 2, skipped: 1, passed: 1, passRate: 0.5, totalP50: 2000, meanLlmCalls: 2 });
  });

  it('rend le rapport et la comparaison', () => {
    const before = run('avant', [result('a', true, 2000), result('b', false, 4000)]);
    const after = run('après', [result('a', false, 3000), result('b', true, 3000)]);
    const md = renderMarkdown(before);
    expect(md).toContain('| 2 (0 ignorées) | 1 (50 %) |');
    expect(md).toContain('### ❌ b — but');
    const diff = compareRuns(before, after);
    expect(diff).toContain('**Régressions (1)** : a');
    expect(diff).toContain('**Améliorations (1)** : b');
  });
});
