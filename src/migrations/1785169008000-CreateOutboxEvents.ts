import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutboxEvents1785169008000
  implements MigrationInterface
{
  name = 'CreateOutboxEvents1785169008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        event_type VARCHAR(120) NOT NULL,
        aggregate_type VARCHAR(80) NOT NULL,
        aggregate_id VARCHAR(80) NOT NULL,
        idempotency_key VARCHAR(190) NOT NULL,
        payload JSON NOT NULL,
        status ENUM('PENDING','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME NULL,
        processed_at DATETIME NULL,
        last_error TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_outbox_tenant_idempotency (tenant_id, idempotency_key),
        KEY idx_outbox_delivery (tenant_id, status, next_attempt_at)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS outbox_events');
  }
}
