import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Support de la passerelle de paiement :
 *   - subscriptions.status : ajout de la valeur `pending_payment`
 *   - subscription_payments : colonnes `provider` et `checkout_url`
 *
 * Idempotent.
 */
export class AddPaymentGatewayToSubscriptions1782000003000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Étendre l'enum status des abonnements
    await queryRunner.query(`
      ALTER TABLE subscriptions
      MODIFY COLUMN status
      ENUM('trial','active','expired','suspended','cancelled','pending_payment')
      NOT NULL DEFAULT 'trial'
    `);

    // 2. Colonnes passerelle sur les paiements (ajout si absentes)
    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'subscription_payments'
         AND COLUMN_NAME IN ('provider','checkout_url')`,
    );
    const have = new Set(cols.map((c) => c.COLUMN_NAME));
    if (!have.has('provider')) {
      await queryRunner.query(
        `ALTER TABLE subscription_payments ADD COLUMN provider VARCHAR(30) NULL AFTER reference`,
      );
    }
    if (!have.has('checkout_url')) {
      await queryRunner.query(
        `ALTER TABLE subscription_payments ADD COLUMN checkout_url VARCHAR(512) NULL AFTER provider`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE subscription_payments DROP COLUMN IF EXISTS checkout_url`,
    );
    await queryRunner.query(
      `ALTER TABLE subscription_payments DROP COLUMN IF EXISTS provider`,
    );
    await queryRunner.query(`
      ALTER TABLE subscriptions
      MODIFY COLUMN status
      ENUM('trial','active','expired','suspended','cancelled')
      NOT NULL DEFAULT 'trial'
    `);
  }
}
