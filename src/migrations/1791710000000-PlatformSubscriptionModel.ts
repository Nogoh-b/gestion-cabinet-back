import { MigrationInterface, QueryRunner } from 'typeorm';

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  definition: string,
) {
  const rows: Array<{ n: number }> = await queryRunner.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (!Number(rows[0]?.n)) {
    await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function addIndexIfMissing(
  queryRunner: QueryRunner,
  table: string,
  index: string,
  columns: string,
) {
  const rows: Array<{ n: number }> = await queryRunner.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index],
  );
  if (!Number(rows[0]?.n)) {
    await queryRunner.query(`CREATE INDEX \`${index}\` ON \`${table}\` (${columns})`);
  }
}

/**
 * Pilotage plateforme des abonnements :
 *   - cabinets : origine de la suspension (paiement initial, échéance, manuelle)
 *     + auteur/date/note → une suspension manuelle n'est plus levée par la
 *     synchronisation automatique de l'abonnement ;
 *   - subscriptions : annulation (date, motif) et origine de la création ;
 *   - subscription_events : historique de toutes les transitions (timeline
 *     cabinet, calcul du churn, dédoublonnage des relances).
 *
 * Idempotent.
 */
export class PlatformSubscriptionModel1791710000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'cabinets', 'suspension_reason', 'suspension_reason VARCHAR(30) NULL');
    await addColumnIfMissing(queryRunner, 'cabinets', 'suspended_at', 'suspended_at DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'cabinets', 'suspended_by_admin_id', 'suspended_by_admin_id INT NULL');
    await addColumnIfMissing(queryRunner, 'cabinets', 'suspension_note', 'suspension_note VARCHAR(500) NULL');

    // Les cabinets déjà suspendus : origine déduite de l'abonnement courant.
    await queryRunner.query(`
      UPDATE cabinets c
         SET c.suspension_reason = CASE
               WHEN EXISTS (SELECT 1 FROM subscriptions s
                             WHERE s.cabinet_id = c.id AND s.status = 'pending_payment')
                 THEN 'payment_required'
               ELSE 'expired'
             END,
             c.suspended_at = COALESCE(c.suspended_at, c.updated_at)
       WHERE c.status = 'suspended' AND c.suspension_reason IS NULL
    `);

    await addColumnIfMissing(queryRunner, 'subscriptions', 'cancelled_at', 'cancelled_at DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'subscriptions', 'cancel_reason', 'cancel_reason VARCHAR(255) NULL');
    await addColumnIfMissing(
      queryRunner,
      'subscriptions',
      'created_by',
      "created_by VARCHAR(20) NOT NULL DEFAULT 'system'",
    );
    await addIndexIfMissing(queryRunner, 'subscriptions', 'IDX_subscriptions_cabinet_status', 'cabinet_id, status');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id INT NOT NULL AUTO_INCREMENT,
        cabinet_id INT NOT NULL,
        subscription_id INT NULL,
        type VARCHAR(40) NOT NULL,
        actor_type VARCHAR(20) NOT NULL DEFAULT 'system',
        actor_id INT NULL,
        actor_label VARCHAR(150) NULL,
        payload JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_subscription_events_cabinet (cabinet_id, created_at),
        KEY IDX_subscription_events_type (type, created_at),
        KEY IDX_subscription_events_subscription (subscription_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS subscription_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_subscriptions_cabinet_status ON subscriptions`);
    await queryRunner.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS created_by`);
    await queryRunner.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancel_reason`);
    await queryRunner.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancelled_at`);
    await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN IF EXISTS suspension_note`);
    await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN IF EXISTS suspended_by_admin_id`);
    await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN IF EXISTS suspended_at`);
    await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN IF EXISTS suspension_reason`);
  }
}
