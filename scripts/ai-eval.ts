/**
 * Banc d'évaluation de l'assistant IA.
 *
 *   npm run eval:ai -- --label "deepseek avant agent"
 *   npm run eval:ai -- --dry-run                 # vérifie les questions sur les données, sans appeler l'IA
 *   npm run eval:ai -- --only point-dossier,dossier-inexistant --repeat 3
 *   npm run eval:ai -- --compare eval-results/a.json eval-results/b.json
 *
 * Pose chaque question au vrai assistant (POST /api/ai-database/ask/stream),
 * calcule la bonne réponse avec la requête de référence sur la même base, et
 * écrit un rapport JSON + Markdown dans eval-results/. Voir docs/ai-eval.md.
 *
 * Variables : EVAL_API_URL, EVAL_TOKEN ou EVAL_EMAIL + EVAL_PASSWORD,
 * EVAL_TENANT_CODE, EVAL_TENANT_ID (sinon lu dans le jeton), EVAL_DB_* (sinon DB_*).
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as mysql from 'mysql2/promise';

import { EVAL_QUESTIONS } from '../src/core/ai-database/eval/eval-questions';
import { compareRuns, renderMarkdown, summarizeRun } from '../src/core/ai-database/eval/eval-report';
import {
  bindSql,
  fillTemplate,
  scoreTurn,
  summarizeChecks,
} from '../src/core/ai-database/eval/eval-scoring';
import { SseParser, summarizeTurn } from '../src/core/ai-database/eval/eval-sse';
import type {
  EvalQuestion,
  EvalRun,
  QuestionResult,
  SseEvent,
  TurnResult,
} from '../src/core/ai-database/eval/eval-types';

interface Options {
  label: string;
  only?: string[];
  categories?: string[];
  dryRun: boolean;
  withWrites: boolean;
  keepConversations: boolean;
  repeat: number;
  pauseMs: number;
  timeoutMs: number;
  out: string;
  compare?: [string, string];
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    label: new Date().toISOString().slice(0, 16).replace(':', 'h'),
    dryRun: false,
    withWrites: false,
    keepConversations: false,
    repeat: 1,
    pauseMs: 500,
    timeoutMs: 180_000,
    out: 'eval-results',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Valeur manquante après ${arg}`);
      return value;
    };
    if (arg === '--label') options.label = next();
    else if (arg === '--only') options.only = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--category') options.categories = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--with-writes') options.withWrites = true;
    else if (arg === '--keep-conversations') options.keepConversations = true;
    else if (arg === '--repeat') options.repeat = Math.max(1, Number(next()) || 1);
    else if (arg === '--pause') options.pauseMs = Math.max(0, Number(next()) || 0);
    else if (arg === '--timeout') options.timeoutMs = Math.max(10, Number(next()) || 180) * 1000;
    else if (arg === '--out') options.out = next();
    else if (arg === '--compare') options.compare = [next(), next()];
    else if (arg === '--help' || arg === '-h') {
      console.log(readHelp());
      process.exit(0);
    } else throw new Error(`Option inconnue : ${arg} (voir --help)`);
  }
  return options;
}

function readHelp(): string {
  return [
    'npm run eval:ai -- [options]',
    '  --label <nom>          nom de l’exécution (fichiers eval-results/<nom>.json|.md)',
    '  --only <id,id>         seulement ces questions',
    '  --category <c,c>       seulement ces catégories',
    '  --dry-run              exécute les requêtes de référence, sans appeler l’IA',
    '  --repeat <n>           pose chaque question n fois (stabilité, latences)',
    '  --with-writes          inclut les questions qui peuvent écrire (SUR UNE COPIE)',
    '  --keep-conversations   ne supprime pas les conversations créées',
    '  --timeout <s>          délai maximal par message (180 s)',
    '  --pause <ms>           pause entre deux questions (500 ms)',
    '  --compare <a> <b>      compare deux exécutions JSON',
  ].join('\n');
}

const env = (name: string, fallback?: string) => process.env[`EVAL_${name}`] ?? process.env[name] ?? fallback;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const slug = (text: string) => text.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'run';

function jwtPayload(token: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function login(apiUrl: string, tenantCode?: string): Promise<string> {
  const email = process.env.EVAL_EMAIL;
  const password = process.env.EVAL_PASSWORD;
  if (!email || !password) {
    throw new Error('Renseignez EVAL_TOKEN, ou EVAL_EMAIL et EVAL_PASSWORD (voir docs/ai-eval.md).');
  }
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tenantCode && { 'x-tenant-code': tenantCode }) },
    body: JSON.stringify({ username: email, password }),
  });
  const body: any = await response.json().catch(() => ({}));
  const token = body?.access_token ?? body?.data?.access_token;
  if (!response.ok || !token) {
    const reason = body?.message ?? body?.data?.message ?? response.statusText;
    throw new Error(
      `Connexion impossible (${response.status}) : ${reason}. Avec la double authentification, utilisez EVAL_TOKEN.`,
    );
  }
  return token;
}

async function askStream(
  apiUrl: string,
  token: string,
  tenantCode: string | undefined,
  question: string,
  conversationId: string | undefined,
  timeoutMs: number,
  extras: { mode?: string; references?: Array<Record<string, unknown>> } = {},
): Promise<TurnResult> {
  const form = new FormData();
  form.append('question', question);
  form.append('intentMode', extras.mode ?? process.env.EVAL_INTENT_MODE ?? 'auto');
  if (conversationId) form.append('conversationId', conversationId);
  // Enregistrements joints comme le front (@mention ou fiche ouverte).
  if (extras.references?.length) form.append('context', JSON.stringify(extras.references));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  const elapsed = () => Date.now() - start;
  const parser = new SseParser();
  const events: SseEvent[] = [];
  try {
    const response = await fetch(`${apiUrl}/api/ai-database/ask/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        ...(tenantCode && { 'x-tenant-code': tenantCode }),
      },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      events.push({ event: 'error', data: { message: `HTTP ${response.status} ${text.slice(0, 300)}` }, at: elapsed() });
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        events.push(...parser.push(decoder.decode(value, { stream: true }), elapsed()));
        if (events.some((event) => event.event === 'done')) break;
      }
      await reader.cancel().catch(() => undefined);
    }
  } catch (error) {
    events.push({
      event: 'error',
      data: { message: controller.signal.aborted ? `délai dépassé (${timeoutMs / 1000} s)` : (error as Error).message },
      at: elapsed(),
    });
  } finally {
    clearTimeout(timer);
  }
  return summarizeTurn(question, events, elapsed());
}

async function deleteConversation(apiUrl: string, token: string, tenantCode: string | undefined, id: string) {
  await fetch(`${apiUrl}/api/ai-database/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, ...(tenantCode && { 'x-tenant-code': tenantCode }) },
  }).catch(() => undefined);
}

type Db = mysql.Connection;

async function query(db: Db, sql: string, params: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const bound = bindSql(sql, params);
  const [rows] = await db.query(bound.sql, bound.values);
  return rows as Array<Record<string, unknown>>;
}

/** Journal du serveur pour cette question : appels au modèle, modèle servi, tokens. */
async function requestLogs(db: Db, tenantId: number, afterId: number) {
  try {
    const [rows] = await db.query(
      'SELECT id, llm_calls, model, estimated_prompt_tokens FROM ai_request_log WHERE tenant_id = ? AND id > ? ORDER BY id',
      [tenantId, afterId],
    );
    const logs = rows as Array<{ id: number; llm_calls: number; model: string; estimated_prompt_tokens: number }>;
    if (!logs.length) return {};
    return {
      llmCalls: logs.reduce((sum, log) => sum + Number(log.llm_calls ?? 0), 0),
      model: logs[logs.length - 1].model ?? undefined,
      promptTokens: logs.reduce((sum, log) => sum + Number(log.estimated_prompt_tokens ?? 0), 0),
    };
  } catch {
    return {};
  }
}

async function lastLogId(db: Db, tenantId: number): Promise<number> {
  try {
    const [rows] = await db.query('SELECT COALESCE(MAX(id), 0) AS id FROM ai_request_log WHERE tenant_id = ?', [tenantId]);
    return Number((rows as Array<{ id: number }>)[0]?.id ?? 0);
  } catch {
    return 0;
  }
}

function selectQuestions(options: Options): EvalQuestion[] {
  const unknown = (options.only ?? []).filter((id) => !EVAL_QUESTIONS.some((q) => q.id === id));
  if (unknown.length) throw new Error(`Questions inconnues : ${unknown.join(', ')}`);
  return EVAL_QUESTIONS.filter(
    (q) =>
      (!options.only || options.only.includes(q.id)) &&
      (!options.categories || options.categories.includes(q.category)),
  );
}

const skippedResult = (question: EvalQuestion, id: string, reason: string, params: Record<string, unknown> = {}): QuestionResult => ({
  id,
  category: question.category,
  goal: question.goal,
  asked: [question.ask].flat(),
  params,
  skipped: reason,
  ok: false,
  score: 0,
  checks: [],
  answer: '',
});

async function run(options: Options): Promise<void> {
  const apiUrl = (env('API_URL', 'http://localhost:3000') as string).replace(/\/+$/, '');
  const tenantCode = process.env.EVAL_TENANT_CODE || undefined;
  const token = options.dryRun ? process.env.EVAL_TOKEN ?? '' : process.env.EVAL_TOKEN ?? (await login(apiUrl, tenantCode));
  const tenantId = Number(process.env.EVAL_TENANT_ID ?? jwtPayload(token).tenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Cabinet évalué inconnu : renseignez EVAL_TENANT_ID (ou un EVAL_TOKEN qui le contient).');
  }

  const db = await mysql.createConnection({
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', '3306')),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME'),
    dateStrings: true,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  const evalRun: EvalRun = { label: options.label, startedAt: new Date().toISOString(), apiUrl, tenantId, questions: [] };
  const questions = selectQuestions(options);
  console.log(`Banc IA « ${options.label} » — ${questions.length} question(s), cabinet ${tenantId}${options.dryRun ? ' (dry-run)' : ''}\n`);

  try {
    for (const question of questions) {
      for (let round = 1; round <= options.repeat; round++) {
        const id = round === 1 ? question.id : `${question.id}#${round}`;
        if (question.mutates && !options.withWrites) {
          evalRun.questions.push(skippedResult(question, id, 'peut écrire : --with-writes, sur une copie uniquement'));
          continue;
        }
        if (question.skipForGlobalTenant && tenantId === 1) {
          evalRun.questions.push(skippedResult(question, id, 'sans objet pour l’administration globale'));
          continue;
        }

        const params: Record<string, unknown> = { tenant: tenantId };
        let referenceRows: Array<Record<string, unknown>> | undefined;
        let forbidden: string[] = [];
        let attached: Array<Record<string, unknown>> = [];
        try {
          if (question.pick) {
            const picked = await query(db, question.pick, params);
            if (!picked.length) {
              evalRun.questions.push(skippedResult(question, id, 'aucune donnée adaptée dans ce cabinet'));
              console.log(`⏭️  ${id} : aucune donnée adaptée`);
              continue;
            }
            Object.assign(params, picked[0]);
          }
          if (question.reference) referenceRows = await query(db, question.reference, params);
          if (question.references) {
            attached = (await query(db, question.references, params)).map((row) => ({
              type: row.type,
              label: String(row.label ?? ''),
              id: row.id,
              data: { id: row.id },
              source: row.source ?? 'mention',
            }));
          }
          if (question.forbidValues) {
            forbidden = (await query(db, question.forbidValues, params)).map((row) => String(row.value ?? '')).filter(Boolean);
          }
        } catch (error) {
          throw new Error(`Requête de référence invalide pour « ${question.id} » : ${(error as Error).message}`);
        }

        const asked = [question.ask].flat().map((text) => fillTemplate(text, params));
        const { tenant: _tenant, ...shownParams } = params;
        if (options.dryRun) {
          const preview = referenceRows ? `${referenceRows.length} ligne(s) de référence ${JSON.stringify(referenceRows.slice(0, 3))}` : 'pas de référence';
          console.log(`🔎 ${id}\n   ${asked.join(' ⟶ ')}\n   ${preview}${forbidden.length ? ` — ${forbidden.length} valeur(s) interdite(s)` : ''}`);
          evalRun.questions.push({ ...skippedResult(question, id, 'dry-run', shownParams), asked });
          continue;
        }

        const logStart = await lastLogId(db, tenantId);
        const turns: TurnResult[] = [];
        let conversationId: string | undefined;
        for (const [index, text] of asked.entries()) {
          const turn = await askStream(apiUrl, token, tenantCode, text, conversationId, options.timeoutMs, {
            mode: question.mode,
            references: index === 0 ? attached : [],
          });
          turns.push(turn);
          conversationId = turn.conversationId ?? conversationId;
          if (turn.error) break;
        }
        const last = turns[turns.length - 1];
        const earlierError = turns.slice(0, -1).find((turn) => turn.error);
        const checks = scoreTurn({
          question,
          turn: earlierError ? { ...last, error: `message précédent : ${earlierError.error}` } : last,
          referenceRows,
          forbiddenValues: forbidden,
        });
        const { ok, score } = summarizeChecks(checks);
        const logs = await requestLogs(db, tenantId, logStart);
        if (conversationId && !options.keepConversations) {
          await deleteConversation(apiUrl, token, tenantCode, conversationId);
        }

        const result: QuestionResult = {
          id,
          category: question.category,
          goal: question.goal,
          asked,
          params: shownParams,
          ok,
          score,
          checks,
          intent: last.intent,
          skills: [...new Set(turns.flatMap((turn) => turn.skills))],
          answer: last.answer,
          firstTokenMs: last.firstTokenMs,
          totalMs: turns.reduce((sum, turn) => sum + turn.totalMs, 0),
          ...logs,
        };
        evalRun.questions.push(result);
        const failed = checks.filter((check) => !check.ok).map((check) => `${check.name}${check.detail ? ` (${check.detail})` : ''}`);
        console.log(
          `${ok ? '✅' : '❌'} ${id} — ${Math.round(score * 100)} % — ${((result.totalMs ?? 0) / 1000).toFixed(1)} s` +
            `${logs.llmCalls !== undefined ? `, ${logs.llmCalls} appel(s) modèle` : ''}${failed.length ? `\n   ${failed.join('\n   ')}` : ''}`,
        );
        if (options.pauseMs) await sleep(options.pauseMs);
      }
    }
  } finally {
    await db.end();
  }

  evalRun.finishedAt = new Date().toISOString();
  await mkdir(options.out, { recursive: true });
  const base = join(options.out, slug(options.label));
  await writeFile(`${base}.json`, JSON.stringify(evalRun, null, 2));
  await writeFile(`${base}.md`, renderMarkdown(evalRun));
  if (options.dryRun) {
    const ready = evalRun.questions.filter((q) => q.skipped === 'dry-run').length;
    console.log(
      `\nDry-run : ${ready} question(s) prêtes, ${evalRun.questions.length - ready} sans objet ou sans donnée adaptée.` +
        `\nRapport : ${base}.md`,
    );
    return;
  }
  const s = summarizeRun(evalRun);
  console.log(
    `\n${s.passed}/${s.evaluated} réussies (${Math.round(s.passRate * 100)} %), score moyen ${Math.round(s.meanScore * 100)} %` +
      `${s.totalP50 !== undefined ? `, réponse médiane ${(s.totalP50 / 1000).toFixed(1)} s` : ''} — ${s.skipped} ignorée(s)` +
      `\nRapport : ${base}.md`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.compare) {
    const [before, after] = await Promise.all(
      options.compare.map(async (file) => JSON.parse(await readFile(file, 'utf8')) as EvalRun),
    );
    const report = compareRuns(before, after);
    await mkdir(options.out, { recursive: true });
    const file = join(options.out, `comparaison-${slug(before.label)}-vs-${slug(after.label)}.md`);
    await writeFile(file, report);
    console.log(`${report}\nRapport : ${file}`);
    return;
  }
  await run(options);
}

main().catch((error) => {
  console.error(`❌ ${(error as Error).message}`);
  process.exit(1);
});
