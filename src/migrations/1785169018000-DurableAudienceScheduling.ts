import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduit l'instant UTC canonique, le fuseau IANA et le journal idempotent
 * des rappels. Les colonnes date/heure historiques restent temporairement
 * disponibles comme projection de compatibilité.
 */
export class DurableAudienceScheduling1785169018000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('audiences', 'starts_at_utc'))) {
      await queryRunner.query(`
        ALTER TABLE audiences
        ADD COLUMN starts_at_utc DATETIME(3) NULL AFTER audience_time
      `);
    }
    if (!(await queryRunner.hasColumn('audiences', 'timezone'))) {
      await queryRunner.query(`
        ALTER TABLE audiences
        ADD COLUMN timezone VARCHAR(64) NULL AFTER starts_at_utc
      `);
    }

    // Les données historiques du périmètre initial sont exprimées à
    // N'Djamena (UTC+01:00, sans changement saisonnier).
    await queryRunner.query(`
      UPDATE audiences
      SET
        timezone = COALESCE(NULLIF(timezone, ''), 'Africa/Ndjamena'),
        starts_at_utc = COALESCE(
          starts_at_utc,
          DATE_SUB(
            TIMESTAMP(
              CONCAT(
                DATE_FORMAT(audience_date, '%Y-%m-%d'),
                ' ',
                audience_time
              )
            ),
            INTERVAL 1 HOUR
          )
        )
    `);
    await queryRunner.query(`
      ALTER TABLE audiences
      MODIFY COLUMN starts_at_utc DATETIME(3) NOT NULL,
      MODIFY COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Ndjamena'
    `);

    const indexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audiences'
        AND INDEX_NAME = 'IDX_audiences_tenant_status_starts'
    `);
    if (!indexes.length) {
      await queryRunner.query(`
        CREATE INDEX IDX_audiences_tenant_status_starts
        ON audiences (tenant_id, status, starts_at_utc)
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_reminder_deliveries (
        event_id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        audience_id INT NOT NULL,
        notification_id INT NULL,
        idempotency_key VARCHAR(191) NOT NULL,
        status ENUM('PROCESSING','DELIVERED','FAILED')
          NOT NULL DEFAULT 'PROCESSING',
        recipient_count INT NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        created_at DATETIME(6) NOT NULL,
        updated_at DATETIME(6) NOT NULL,
        delivered_at DATETIME(6) NULL,
        PRIMARY KEY (event_id),
        UNIQUE KEY UQ_audience_reminder_delivery_tenant_key
          (tenant_id, idempotency_key),
        KEY IDX_audience_reminder_delivery_audience
          (tenant_id, audience_id, status)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audience_reminder_deliveries`);
    const indexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(`
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'audiences'
        AND INDEX_NAME = 'IDX_audiences_tenant_status_starts'
    `);
    if (indexes.length) {
      await queryRunner.query(`
        DROP INDEX IDX_audiences_tenant_status_starts ON audiences
      `);
    }
    if (await queryRunner.hasColumn('audiences', 'timezone')) {
      await queryRunner.query(`ALTER TABLE audiences DROP COLUMN timezone`);
    }
    if (await queryRunner.hasColumn('audiences', 'starts_at_utc')) {
      await queryRunner.query(
        `ALTER TABLE audiences DROP COLUMN starts_at_utc`,
      );
    }
  }
}
