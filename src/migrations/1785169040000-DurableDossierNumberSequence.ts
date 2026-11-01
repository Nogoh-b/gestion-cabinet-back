import { MigrationInterface, QueryRunner } from 'typeorm';

export class DurableDossierNumberSequence1785169040000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_number_sequences (
        tenant_id INT NOT NULL,
        scope_key CHAR(64) NOT NULL,
        next_value BIGINT UNSIGNED NOT NULL DEFAULT 1,
        updated_at DATETIME(6) NOT NULL
          DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tenant_id, scope_key)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS dossier_number_sequences');
  }
}
