import { MigrationInterface, QueryRunner } from 'typeorm';

export class DurableSubscriptionWebhookEvents1785169036000
  implements MigrationInterface
{
  name = 'DurableSubscriptionWebhookEvents1785169036000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscription_webhook_events (
        event_id VARCHAR(128) NOT NULL,
        payment_id INT NULL,
        payment_reference VARCHAR(100) NOT NULL,
        payment_status ENUM('paid', 'failed') NOT NULL,
        received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        processed_at DATETIME(6) NULL,
        PRIMARY KEY (event_id),
        INDEX IDX_subscription_webhook_payment (payment_id),
        CONSTRAINT FK_subscription_webhook_payment
          FOREIGN KEY (payment_id)
          REFERENCES subscription_payments(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS subscription_webhook_events',
    );
  }
}
