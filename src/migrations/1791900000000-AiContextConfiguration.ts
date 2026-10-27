import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { DEFAULT_AI_CONTEXT_CONFIGS } from '../core/ai-database/ai-context-defaults';

export class AiContextConfiguration1791900000000 implements MigrationInterface {
  name = 'AiContextConfiguration1791900000000';
  async up(runner: QueryRunner) {
    const base = [
      { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' as const },
      { name: 'tenant_id', type: 'int', default: 1 },
      { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
      { name: 'deleted_at', type: 'timestamp', isNullable: true },
    ];
    if (!await runner.hasTable('ai_context_configs')) {
      await runner.createTable(new Table({ name: 'ai_context_configs', columns: [...base,
        { name: 'resource_type', type: 'varchar', length: '80', default: "'*'" },
        { name: 'scope', type: 'varchar', length: '32', default: "'*'" },
        { name: 'operation_key', type: 'varchar', length: '120', default: "'*'" },
        { name: 'label', type: 'varchar', length: '200' }, { name: 'instructions', type: 'text', isNullable: true },
        { name: 'enabled', type: 'tinyint', default: 1 },
      ] }), true);
      await runner.createIndex('ai_context_configs', new TableIndex({ name: 'UQ_ai_context_scope', columnNames: ['tenant_id', 'resource_type', 'scope', 'operation_key'], isUnique: true }));
    }
    if (!await runner.hasTable('ai_context_suggestions')) {
      await runner.createTable(new Table({ name: 'ai_context_suggestions', columns: [...base,
        { name: 'context_id', type: 'int' }, { name: 'code', type: 'varchar', length: '80' },
        { name: 'label', type: 'varchar', length: '200' }, { name: 'prompt', type: 'text' },
        { name: 'intent', type: 'varchar', length: '16', default: "'read'" },
        { name: 'permission', type: 'varchar', length: '100', isNullable: true },
        { name: 'sort_order', type: 'int', default: 0 }, { name: 'enabled', type: 'tinyint', default: 1 },
      ] }), true);
      await runner.createIndex('ai_context_suggestions', new TableIndex({ name: 'UQ_ai_context_suggestion_code', columnNames: ['tenant_id', 'context_id', 'code'], isUnique: true }));
      await runner.createForeignKey('ai_context_suggestions', new TableForeignKey({ columnNames: ['context_id'], referencedTableName: 'ai_context_configs', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
    }
    const tenants = new Set<number>([1]);
    if (await runner.hasTable('cabinets')) for (const row of await runner.query('SELECT id FROM cabinets')) tenants.add(Number(row.id));
    for (const tenant of tenants) for (const config of DEFAULT_AI_CONTEXT_CONFIGS) {
      await runner.query('INSERT IGNORE INTO ai_context_configs (tenant_id, resource_type, scope, operation_key, label, instructions, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tenant, config.resource_type, config.scope, config.operation_key, config.label, config.instructions, config.enabled]);
      const [stored] = await runner.query('SELECT id FROM ai_context_configs WHERE tenant_id = ? AND resource_type = ? AND scope = ? AND operation_key = ?', [tenant, config.resource_type, config.scope, config.operation_key]);
      for (const suggestion of config.suggestions) await runner.query('INSERT IGNORE INTO ai_context_suggestions (tenant_id, context_id, code, label, prompt, intent, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [tenant, stored.id, suggestion.code, suggestion.label, suggestion.prompt, suggestion.intent, suggestion.sort_order, suggestion.enabled]);
    }
  }
  async down(runner: QueryRunner) {
    await runner.dropTable('ai_context_suggestions', true);
    await runner.dropTable('ai_context_configs', true);
  }
}
