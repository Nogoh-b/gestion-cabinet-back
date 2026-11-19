import type { EvalRun, QuestionResult } from './eval-types';

export function percentile(values: number[], p: number): number | undefined {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

const seconds = (ms?: number) => (ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`);
const pct = (value: number) => `${Math.round(value * 100)} %`;
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined);

export interface RunSummary {
  evaluated: number;
  skipped: number;
  passed: number;
  passRate: number;
  meanScore: number;
  firstTokenP50?: number;
  firstTokenP90?: number;
  totalP50?: number;
  totalP90?: number;
  meanLlmCalls?: number;
  byCategory: Record<string, { evaluated: number; passed: number; meanScore: number }>;
}

export function summarizeRun(run: EvalRun): RunSummary {
  const evaluated = run.questions.filter((q) => !q.skipped);
  const passed = evaluated.filter((q) => q.ok);
  const firstTokens = evaluated.map((q) => q.firstTokenMs).filter((v): v is number => v !== undefined);
  const totals = evaluated.map((q) => q.totalMs).filter((v): v is number => v !== undefined);
  const calls = evaluated.map((q) => q.llmCalls).filter((v): v is number => v !== undefined);
  const byCategory: RunSummary['byCategory'] = {};
  for (const q of evaluated) {
    const entry = (byCategory[q.category] ??= { evaluated: 0, passed: 0, meanScore: 0 });
    entry.evaluated++;
    if (q.ok) entry.passed++;
    entry.meanScore += q.score;
  }
  for (const entry of Object.values(byCategory)) entry.meanScore /= entry.evaluated || 1;
  return {
    evaluated: evaluated.length,
    skipped: run.questions.length - evaluated.length,
    passed: passed.length,
    passRate: evaluated.length ? passed.length / evaluated.length : 0,
    meanScore: average(evaluated.map((q) => q.score)) ?? 0,
    firstTokenP50: percentile(firstTokens, 50),
    firstTokenP90: percentile(firstTokens, 90),
    totalP50: percentile(totals, 50),
    totalP90: percentile(totals, 90),
    meanLlmCalls: average(calls),
    byCategory,
  };
}

const cell = (text: unknown) => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const excerpt = (text: string, max = 400) => {
  const clean = String(text ?? '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

export function renderMarkdown(run: EvalRun): string {
  const s = summarizeRun(run);
  const models = Array.from(new Set(run.questions.map((q) => q.model).filter(Boolean)));
  const lines: string[] = [
    `# Banc d'évaluation IA — ${run.label}`,
    '',
    `- Exécuté le ${run.startedAt}${run.finishedAt ? ` (fin ${run.finishedAt})` : ''}`,
    `- API : ${run.apiUrl} — cabinet ${run.tenantId}${models.length ? ` — modèle(s) : ${models.join(', ')}` : ''}`,
    '',
    '## Résultat',
    '',
    '| Questions | Réussies | Score moyen | 1er mot (médiane / p90) | Réponse complète (médiane / p90) | Appels modèle / question |',
    '|---|---|---|---|---|---|',
    `| ${s.evaluated} (${s.skipped} ignorées) | ${s.passed} (${pct(s.passRate)}) | ${pct(s.meanScore)} | ${seconds(s.firstTokenP50)} / ${seconds(s.firstTokenP90)} | ${seconds(s.totalP50)} / ${seconds(s.totalP90)} | ${s.meanLlmCalls === undefined ? '—' : s.meanLlmCalls.toFixed(1)} |`,
    '',
    '## Par catégorie',
    '',
    '| Catégorie | Réussies | Score moyen |',
    '|---|---|---|',
    ...Object.entries(s.byCategory).map(
      ([category, c]) => `| ${category} | ${c.passed}/${c.evaluated} | ${pct(c.meanScore)} |`,
    ),
    '',
    '## Questions',
    '',
    '| | Question | Catégorie | Score | Intention | 1er mot | Total | Appels |',
    '|---|---|---|---|---|---|---|---|',
    ...run.questions.map((q) =>
      q.skipped
        ? `| ⏭️ | ${cell(q.id)} | ${q.category} | — | — | — | — | ${cell(q.skipped)} |`
        : `| ${q.ok ? '✅' : '❌'} | ${cell(q.id)} | ${q.category} | ${pct(q.score)} | ${cell(`${q.intent ?? '—'}${q.skills?.length ? ` · ${q.skills.join(', ')}` : ''}`)} | ${seconds(q.firstTokenMs)} | ${seconds(q.totalMs)} | ${q.llmCalls ?? '—'} |`,
    ),
  ];

  const failures = run.questions.filter((q) => !q.skipped && !q.ok);
  if (failures.length) {
    lines.push('', '## Détail des échecs', '');
    for (const q of failures) {
      lines.push(
        `### ❌ ${q.id} — ${q.goal}`,
        '',
        ...q.asked.map((asked) => `> **Question :** ${asked}`),
        '',
        ...q.checks.filter((c) => !c.ok).map((c) => `- **${c.name}** : ${c.detail ?? 'échec'}`),
        '',
        '<details><summary>Réponse de l’assistant</summary>',
        '',
        '```text',
        excerpt(q.answer, 1500),
        '```',
        '',
        '</details>',
        '',
      );
    }
  }
  return lines.join('\n');
}

/** Comparaison de deux exécutions (ex. avant / après un changement de modèle ou de prompt). */
export function compareRuns(before: EvalRun, after: EvalRun): string {
  const a = summarizeRun(before);
  const b = summarizeRun(after);
  const delta = (x?: number, y?: number, unit: 'pct' | 's' | 'n' = 'pct') => {
    if (x === undefined || y === undefined) return '—';
    const d = y - x;
    const sign = d > 0 ? '+' : '';
    if (unit === 'pct') return `${sign}${Math.round(d * 100)} pts`;
    if (unit === 's') return `${sign}${(d / 1000).toFixed(1)} s`;
    return `${sign}${d.toFixed(1)}`;
  };
  const byId = new Map(before.questions.map((q) => [q.id, q]));
  const regressed: QuestionResult[] = [];
  const improved: QuestionResult[] = [];
  for (const q of after.questions) {
    const old = byId.get(q.id);
    if (!old || old.skipped || q.skipped) continue;
    if (old.ok && !q.ok) regressed.push(q);
    if (!old.ok && q.ok) improved.push(q);
  }
  return [
    `# Comparaison : ${before.label} → ${after.label}`,
    '',
    '| Mesure | Avant | Après | Écart |',
    '|---|---|---|---|',
    `| Réussite | ${pct(a.passRate)} | ${pct(b.passRate)} | ${delta(a.passRate, b.passRate)} |`,
    `| Score moyen | ${pct(a.meanScore)} | ${pct(b.meanScore)} | ${delta(a.meanScore, b.meanScore)} |`,
    `| 1er mot (médiane) | ${seconds(a.firstTokenP50)} | ${seconds(b.firstTokenP50)} | ${delta(a.firstTokenP50, b.firstTokenP50, 's')} |`,
    `| 1er mot (p90) | ${seconds(a.firstTokenP90)} | ${seconds(b.firstTokenP90)} | ${delta(a.firstTokenP90, b.firstTokenP90, 's')} |`,
    `| Réponse complète (médiane) | ${seconds(a.totalP50)} | ${seconds(b.totalP50)} | ${delta(a.totalP50, b.totalP50, 's')} |`,
    `| Réponse complète (p90) | ${seconds(a.totalP90)} | ${seconds(b.totalP90)} | ${delta(a.totalP90, b.totalP90, 's')} |`,
    `| Appels modèle / question | ${a.meanLlmCalls?.toFixed(1) ?? '—'} | ${b.meanLlmCalls?.toFixed(1) ?? '—'} | ${delta(a.meanLlmCalls, b.meanLlmCalls, 'n')} |`,
    '',
    `**Régressions (${regressed.length})** : ${regressed.map((q) => q.id).join(', ') || 'aucune'}`,
    '',
    `**Améliorations (${improved.length})** : ${improved.map((q) => q.id).join(', ') || 'aucune'}`,
    '',
  ].join('\n');
}
