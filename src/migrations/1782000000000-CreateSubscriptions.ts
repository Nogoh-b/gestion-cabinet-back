import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abonnements des cabinets + échéances de facturation.
 *
 * Deux tables AU NIVEAU PLATEFORME (comme `cabinets` et `plans`, donc SANS
 * colonne `tenant_id`) :
 *   - `subscriptions`         : plan + cycle (mensuel/annuel) + dates + statut.
 *                               `ends_at` pilote le décompte affiché au front.
 *   - `subscription_payments` : échéances (statut `pending` tant qu'aucun
 *                               paiement réel n'est encaissé).
 *
 * Idempotent (`CREATE TABLE IF NOT EXISTS`) — la base de dev tourne en
 * `synchronize:true` et a pu déjà matérialiser ces tables.
 */
export class CreateSubscriptions1782000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INT NOT NULL AUTO_INCREMENT,
        cabinet_id INT NOT NULL,
        plan_id INT NOT NULL,
        billing_cycle ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
        status ENUM('trial','active','expired','suspended','cancelled') NOT NULL DEFAULT 'trial',
        started_at DATETIME NOT NULL,
        ends_at DATETIME NULL,
        is_trial TINYINT NOT NULL DEFAULT 0,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
        auto_renew TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_subscriptions_cabinet (cabinet_id),
        INDEX IDX_subscriptions_status (status),
        INDEX IDX_subscriptions_ends_at (ends_at)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscription_payments (
        id INT NOT NULL AUTO_INCREMENT,
        subscription_id INT NOT NULL,
        cabinet_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
        status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
        due_date DATE NOT NULL,
        paid_at DATETIME NULL,
        period_start DATE NOT NULL,
        period_end DATE NULL,
        method VARCHAR(30) NULL,
        reference VARCHAR(100) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_sub_payments_cabinet (cabinet_id),
        INDEX IDX_sub_payments_subscription (subscription_id),
        CONSTRAINT FK_sub_payments_subscription FOREIGN KEY (subscription_id)
          REFERENCES subscriptions (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS subscription_payments`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriptions`);
  }
}
