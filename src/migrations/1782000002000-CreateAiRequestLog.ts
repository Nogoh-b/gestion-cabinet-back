import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journal des requêtes IA (`ai_request_log`) — support du quota mensuel
 * `ai_requests_per_month`. Idempotent (`CREATE TABLE IF NOT EXISTS`).
 */
export class CreateAiRequestLog1782000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_request_log (
        id INT NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        user_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_ai_request_tenant_date (tenant_id, created_at)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_request_log`);
  }
}
