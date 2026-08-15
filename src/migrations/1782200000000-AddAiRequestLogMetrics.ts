import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiRequestLogMetrics1782200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const addColumn = async (name: string, definition: string) => {
      const exists = await queryRunner.hasColumn('ai_request_log', name);
      if (!exists) {
        await queryRunner.query(`ALTER TABLE ai_request_log ADD COLUMN ${name} ${definition}`);
      }
    };

    await addColumn('total_ms', 'INT NULL');
    await addColumn('first_token_ms', 'INT NULL');
    await addColumn('llm_calls', 'INT NOT NULL DEFAULT 0');
    await addColumn('estimated_prompt_tokens', 'INT NOT NULL DEFAULT 0');
    await addColumn('output_chars', 'INT NOT NULL DEFAULT 0');
    await addColumn('request_type', 'VARCHAR(32) NULL');
    await addColumn('intent', 'VARCHAR(32) NULL');
    await addColumn('model', 'VARCHAR(128) NULL');
    await addColumn('cache_hit', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumn('status', "VARCHAR(32) NOT NULL DEFAULT 'started'");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropColumn = async (name: string) => {
      const exists = await queryRunner.hasColumn('ai_request_log', name);
      if (exists) {
        await queryRunner.query(`ALTER TABLE ai_request_log DROP COLUMN ${name}`);
      }
    };

    await dropColumn('status');
    await dropColumn('cache_hit');
    await dropColumn('model');
    await dropColumn('intent');
    await dropColumn('request_type');
    await dropColumn('output_chars');
    await dropColumn('estimated_prompt_tokens');
    await dropColumn('llm_calls');
    await dropColumn('first_token_ms');
    await dropColumn('total_ms');
  }
}
