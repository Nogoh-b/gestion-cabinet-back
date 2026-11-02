import { Logger, QueryRunner } from 'typeorm';

/**
 * Logger TypeORM minimal, conservé pour les outils de maintenance éventuels.
 * Il ne journalise jamais le SQL ni ses paramètres.
 */
export class QueryLoggingInterceptor implements Logger {
  logQuery(query: string): void {
    console.log(`DB ${this.operation(query)}`);
  }

  logQueryError(_error: string, query: string): void {
    console.error(`DB ${this.operation(query)} echec`);
  }

  logQuerySlow(time: number, query: string): void {
    console.warn(`DB ${this.operation(query)} lent (${time}ms)`);
  }

  logSchemaBuild(_message: string, _queryRunner?: QueryRunner): void {
    console.log('DB schema en cours');
  }

  logMigration(_message: string, _queryRunner?: QueryRunner): void {
    console.log('DB migration en cours');
  }

  log(
    level: 'log' | 'info' | 'warn',
    _message: unknown,
    _queryRunner?: QueryRunner,
  ): void {
    console.log(`DB ${level}`);
  }

  private operation(query: string): string {
    const operation = String(query ?? '')
      .trim()
      .split(/\s+/, 1)[0]
      ?.toUpperCase();
    return /^[A-Z]+$/.test(operation) ? operation : 'QUERY';
  }
}
