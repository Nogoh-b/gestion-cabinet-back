import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mémorise le dernier événement de passerelle traité afin de rendre les
 * confirmations d'abonnement rejouables sans double effet.
 */
export class SecureSubscriptionWebhooks1785169000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'subscription_payments'
         AND COLUMN_NAME IN ('last_webhook_event_id', 'last_webhook_at')`,
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existingColumns.has('last_webhook_event_id')) {
      await queryRunner.query(
        `ALTER TABLE subscription_payments
         ADD COLUMN last_webhook_event_id VARCHAR(128) NULL AFTER checkout_url`,
      );
    }
    if (!existingColumns.has('last_webhook_at')) {
      await queryRunner.query(
        `ALTER TABLE subscription_payments
         ADD COLUMN last_webhook_at DATETIME NULL AFTER last_webhook_event_id`,
      );
    }

    const indexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'subscription_payments'
         AND INDEX_NAME = 'UQ_subscription_payment_webhook_event'`,
    );
    if (!indexes.length) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX UQ_subscription_payment_webhook_event
         ON subscription_payments (last_webhook_event_id)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'subscription_payments'
         AND INDEX_NAME = 'UQ_subscription_payment_webhook_event'`,
    );
    if (indexes.length) {
      await queryRunner.query(
        `DROP INDEX UQ_subscription_payment_webhook_event ON subscription_payments`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE subscription_payments DROP COLUMN IF EXISTS last_webhook_at`,
    );
    await queryRunner.query(
      `ALTER TABLE subscription_payments DROP COLUMN IF EXISTS last_webhook_event_id`,
    );
  }
}
