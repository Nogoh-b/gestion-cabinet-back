import {
  aiSqlMaxExecutionMs,
  applyStatementTimeout,
  DEFAULT_AI_SQL_MAX_EXECUTION_MS,
  isStatementTimeoutError,
  sqlEngineFromVersion,
} from './sql-time-limit';

describe('durée maximale des lectures IA', () => {
  it('reconnaît MariaDB et MySQL d’après VERSION()', () => {
    expect(sqlEngineFromVersion('10.6.18-MariaDB-0ubuntu0.22.04.1')).toBe('mariadb');
    expect(sqlEngineFromVersion('8.0.36')).toBe('mysql');
    expect(sqlEngineFromVersion(undefined)).toBe('unknown');
  });

  it('pose la limite propre à chaque moteur', () => {
    const sql = 'SELECT f.numero FROM factures f WHERE f.tenant_id = 7 LIMIT 50';
    expect(applyStatementTimeout(sql, 'mariadb', 15000)).toBe(
      'SET STATEMENT max_statement_time=15 FOR SELECT f.numero FROM factures f WHERE f.tenant_id = 7 LIMIT 50',
    );
    expect(applyStatementTimeout(sql, 'mysql', 15000)).toBe(
      'SELECT /*+ MAX_EXECUTION_TIME(15000) */ f.numero FROM factures f WHERE f.tenant_id = 7 LIMIT 50',
    );
    expect(applyStatementTimeout(sql, 'mariadb', 2500)).toContain('max_statement_time=2.5 FOR');
  });

  it('ne touche ni un moteur inconnu, ni une limite désactivée, ni un non-SELECT', () => {
    const sql = 'SELECT 1';
    expect(applyStatementTimeout(sql, 'unknown', 15000)).toBe(sql);
    expect(applyStatementTimeout(sql, 'mariadb', 0)).toBe(sql);
    expect(applyStatementTimeout('EXPLAIN SELECT 1', 'mariadb', 15000)).toBe('EXPLAIN SELECT 1');
  });

  it('lit AI_SQL_MAX_EXECUTION_MS (15 s par défaut, 0 pour désactiver)', () => {
    expect(aiSqlMaxExecutionMs({})).toBe(DEFAULT_AI_SQL_MAX_EXECUTION_MS);
    expect(aiSqlMaxExecutionMs({ AI_SQL_MAX_EXECUTION_MS: '30000' })).toBe(30000);
    expect(aiSqlMaxExecutionMs({ AI_SQL_MAX_EXECUTION_MS: '0' })).toBe(0);
    expect(aiSqlMaxExecutionMs({ AI_SQL_MAX_EXECUTION_MS: 'abc' })).toBe(0);
  });

  it('reconnaît l’interruption pour durée dépassée', () => {
    expect(isStatementTimeoutError({ errno: 1969 })).toBe(true);
    expect(isStatementTimeoutError({ errno: 3024 })).toBe(true);
    expect(isStatementTimeoutError({ message: 'Query execution was interrupted (max_statement_time exceeded)' })).toBe(true);
    expect(isStatementTimeoutError({ errno: 1054, message: "Unknown column 'x'" })).toBe(false);
  });
});
