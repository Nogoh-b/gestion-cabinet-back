/**
 * Durée maximale d'une requête de lecture générée par l'IA.
 *
 * Une requête mal construite (produit cartésien, sous-requête corrélée sur
 * une grosse table) ne doit pas occuper la base indéfiniment. La limite est
 * posée sur la requête elle-même, sans aller-retour supplémentaire :
 * - MariaDB : `SET STATEMENT max_statement_time=<s> FOR SELECT …` ;
 * - MySQL   : `SELECT /*+ MAX_EXECUTION_TIME(<ms>) *\/ …`.
 * Moteur inconnu : requête inchangée.
 */

export type SqlEngine = 'mariadb' | 'mysql' | 'unknown';

export const DEFAULT_AI_SQL_MAX_EXECUTION_MS = 15_000;

/** Limite configurée (AI_SQL_MAX_EXECUTION_MS) ; 0 ou négatif : pas de limite. */
export function aiSqlMaxExecutionMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AI_SQL_MAX_EXECUTION_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_AI_SQL_MAX_EXECUTION_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Moteur d'après `SELECT VERSION()` (« 10.6.18-MariaDB-… », « 8.0.36 »). */
export function sqlEngineFromVersion(version: unknown): SqlEngine {
  const text = String(version ?? '');
  if (/mariadb/i.test(text)) return 'mariadb';
  return /^\d+\.\d+/.test(text) ? 'mysql' : 'unknown';
}

export function applyStatementTimeout(sql: string, engine: SqlEngine, maxMs: number): string {
  if (!(maxMs > 0) || !/^\s*select\b/i.test(sql)) return sql;
  if (engine === 'mariadb') {
    const seconds = Number((maxMs / 1000).toFixed(3));
    return `SET STATEMENT max_statement_time=${seconds} FOR ${sql.trimStart()}`;
  }
  if (engine === 'mysql') {
    return sql.replace(/^\s*select\b/i, (select) => `${select} /*+ MAX_EXECUTION_TIME(${maxMs}) */`);
  }
  return sql;
}

/** Erreur « durée maximale dépassée » (MariaDB 1969, MySQL 3024). */
export function isStatementTimeoutError(error: unknown): boolean {
  const err = error as { errno?: number; code?: string; message?: string } | undefined;
  return (
    err?.errno === 1969 ||
    err?.errno === 3024 ||
    err?.code === 'ER_STATEMENT_TIMEOUT' ||
    err?.code === 'ER_QUERY_TIMEOUT' ||
    /max_statement_time|maximum statement execution time/i.test(err?.message ?? '')
  );
}
