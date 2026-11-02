import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenOutboxDelivery1785169015000
  implements MigrationInterface
{
  name = 'HardenOutboxDelivery1785169015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox_events
      MODIFY status ENUM(
        'PENDING',
        'PROCESSING',
        'PROCESSED',
        'FAILED',
        'DEAD_LETTER'
      ) NOT NULL DEFAULT 'PENDING'
    `);
    await queryRunner.query(`
      ALTER TABLE outbox_events
      ADD COLUMN locked_at DATETIME NULL AFTER last_error,
      ADD COLUMN locked_by VARCHAR(120) NULL AFTER locked_at,
      ADD KEY idx_outbox_claim (status, next_attempt_at, locked_at, created_at)
    `);
    await queryRunner.query(`
      CREATE TABLE outbox_delivery_attempts (
        id CHAR(36) NOT NULL,
        event_id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        attempt_number INT NOT NULL,
        status ENUM(
          'STARTED',
          'SUCCEEDED',
          'FAILED',
          'DEAD_LETTERED'
        ) NOT NULL DEFAULT 'STARTED',
        worker_id VARCHAR(120) NOT NULL,
        started_at DATETIME NOT NULL,
        finished_at DATETIME NULL,
        error TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_outbox_attempt_event_number (event_id, attempt_number),
        KEY idx_outbox_attempt_tenant_date (tenant_id, created_at),
        CONSTRAINT fk_outbox_attempt_event
          FOREIGN KEY (event_id) REFERENCES outbox_events(id)
          ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      UPDATE outbox_events
      SET status = 'FAILED',
          next_attempt_at = UTC_TIMESTAMP(),
          locked_at = NULL,
          locked_by = NULL,
          last_error = COALESCE(
            last_error,
            'Reprise après déploiement du worker durable'
          )
      WHERE status = 'PROCESSING'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE outbox_events DROP INDEX idx_outbox_claim',
    );
    await queryRunner.query('DROP TABLE outbox_delivery_attempts');
    await queryRunner.query(`
      ALTER TABLE outbox_events
      DROP COLUMN locked_by,
      DROP COLUMN locked_at
    `);
    await queryRunner.query(`
      ALTER TABLE outbox_events
      MODIFY status ENUM(
        'PENDING',
        'PROCESSING',
        'PROCESSED',
        'FAILED'
      ) NOT NULL DEFAULT 'PENDING'
    `);
  }
}
