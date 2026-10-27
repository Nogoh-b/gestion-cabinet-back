import { MigrationInterface, QueryRunner } from 'typeorm';

async function addColumn(q: QueryRunner, table: string, column: string, definition: string) {
  const rows: Array<{ n: number }> = await q.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (!Number(rows[0]?.n)) await q.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
}

/**
 * Codes promo des abonnements :
 *   - platform_coupons    : remise en %, montant fixe ou mois offerts,
 *                           limites (plans, cycle, durée, quotas, dates) ;
 *   - coupon_redemptions  : chaque utilisation (cabinet, abonnement, échéance) ;
 *   - subscriptions       : coupon appliqué et échéances restant à remiser.
 * Idempotent.
 */
export class PlatformCoupons1791740000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS platform_coupons (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(40) NOT NULL,
        description VARCHAR(255) NULL,
        type ENUM('percent','fixed','free_months') NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        plan_ids JSON NULL,
        cycle ENUM('any','monthly','yearly') NOT NULL DEFAULT 'any',
        duration_cycles INT NULL,
        max_redemptions INT NULL,
        max_per_cabinet INT NOT NULL DEFAULT 1,
        redeemed_count INT NOT NULL DEFAULT 0,
        valid_from DATETIME NULL,
        valid_until DATETIME NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by_admin_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_platform_coupons_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id INT NOT NULL AUTO_INCREMENT,
        coupon_id INT NOT NULL,
        cabinet_id INT NOT NULL,
        subscription_id INT NULL,
        payment_id INT NULL,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        free_months INT NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_coupon_redemptions_coupon (coupon_id),
        KEY IDX_coupon_redemptions_cabinet (cabinet_id),
        CONSTRAINT FK_coupon_redemptions_coupon FOREIGN KEY (coupon_id)
          REFERENCES platform_coupons (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await addColumn(q, 'subscriptions', 'coupon_id', 'coupon_id INT NULL');
    await addColumn(q, 'subscriptions', 'discount_cycles_remaining', 'discount_cycles_remaining INT NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS discount_cycles_remaining`);
    await q.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS coupon_id`);
    await q.query(`DROP TABLE IF EXISTS coupon_redemptions`);
    await q.query(`DROP TABLE IF EXISTS platform_coupons`);
  }
}
