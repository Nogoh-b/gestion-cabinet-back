import { Logger, QueryRunner } from 'typeorm';


export class QueryLoggingInterceptor implements Logger {
  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner) {
    const isReadQuery = this.isReadOperation(query);
    console.log(`📊 ${isReadQuery ? 'READ' : 'WRITE'} Query: ${query}`);
    if (parameters && parameters.length) {
      console.log(`   Parameters: ${JSON.stringify(parameters)}`);
    }
  }

  logQueryError(error: string, query: string, parameters?: any[], queryRunner?: QueryRunner) {
    console.error(`❌ Query Error: ${error}`);
    console.error(`   Query: ${query}`);
  }

  logQuerySlow(time: number, query: string, parameters?: any[], queryRunner?: QueryRunner) {
    console.warn(`🐌 Slow Query (${time}ms): ${query}`);
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner) {
    console.log(`🏗️ Schema: ${message}`);
  }

  logMigration(message: string, queryRunner?: QueryRunner) {
    console.log(`🚚 Migration: ${message}`);
  }

  log(level: 'log' | 'info' | 'warn', message: any, queryRunner?: QueryRunner) {
    console.log(`📝 ${level}: ${message}`);
  }

  private isReadOperation(query: string): boolean {
    const normalizedQuery = query.trim().toUpperCase();
    return (
      normalizedQuery.startsWith('SELECT') ||
      normalizedQuery.startsWith('WITH') ||
      normalizedQuery.startsWith('SHOW') ||
      normalizedQuery.startsWith('DESCRIBE') ||
      normalizedQuery.startsWith('EXPLAIN')
    );
  }
}