import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remplace l'ancien statut procédural du dossier par son cycle administratif.
 * La valeur historique est conservée dans une table de rapprochement et n'est
 * plus consultée par le code métier.
 */
export class MigrateDossierLifecycle1785169002000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_lifecycle_migration_audit (
        dossier_id INT NOT NULL,
        tenant_id INT NULL,
        legacy_status VARCHAR(64) NULL,
        proposed_lifecycle ENUM('DRAFT','ACTIVE','CLOSED','ARCHIVED') NOT NULL,
        requires_review TINYINT(1) NOT NULL DEFAULT 0,
        migrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dossier_id)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO dossier_lifecycle_migration_audit
        (dossier_id, tenant_id, legacy_status, proposed_lifecycle, requires_review)
      SELECT
        id,
        tenant_id,
        CAST(status AS CHAR),
        CASE
          WHEN CAST(status AS CHAR) IN ('9', 'ARCHIVED', 'archived') THEN 'ARCHIVED'
          WHEN CAST(status AS CHAR) IN ('8', 'CLOSED', 'closed') THEN 'CLOSED'
          WHEN procedureInstanceId IS NULL THEN 'DRAFT'
          ELSE 'ACTIVE'
        END,
        CASE
          WHEN CAST(status AS CHAR) NOT IN ('8', '9', 'CLOSED', 'closed', 'ARCHIVED', 'archived')
               AND procedureInstanceId IS NULL
          THEN 1
          ELSE 0
        END
      FROM dossiers
    `);

    const columns: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'dossiers'
         AND COLUMN_NAME = 'lifecycle_status'`,
    );
    if (!columns.length) {
      await queryRunner.query(`
        ALTER TABLE dossiers
        ADD COLUMN lifecycle_status ENUM('DRAFT','ACTIVE','CLOSED','ARCHIVED')
        NULL AFTER status
      `);
    }

    await queryRunner.query(`
      UPDATE dossiers d
      INNER JOIN dossier_lifecycle_migration_audit a ON a.dossier_id = d.id
      SET d.lifecycle_status = a.proposed_lifecycle
    `);
    await queryRunner.query(`
      UPDATE dossiers SET lifecycle_status = 'DRAFT'
      WHERE lifecycle_status IS NULL
    `);
    await queryRunner.query(`ALTER TABLE dossiers DROP COLUMN status`);
    await queryRunner.query(`
      ALTER TABLE dossiers
      CHANGE COLUMN lifecycle_status status
      ENUM('DRAFT','ACTIVE','CLOSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dossiers
      ADD COLUMN legacy_status ENUM('0','1','2','3','4','5','6','7','8','9','10')
      NULL AFTER status
    `);
    await queryRunner.query(`
      UPDATE dossiers d
      LEFT JOIN dossier_lifecycle_migration_audit a ON a.dossier_id = d.id
      SET d.legacy_status = CASE
        WHEN a.legacy_status IN ('0','1','2','3','4','5','6','7','8','9','10')
          THEN a.legacy_status
        WHEN d.status = 'CLOSED' THEN '8'
        WHEN d.status = 'ARCHIVED' THEN '9'
        ELSE '0'
      END
    `);
    await queryRunner.query(`ALTER TABLE dossiers DROP COLUMN status`);
    await queryRunner.query(`
      ALTER TABLE dossiers
      CHANGE COLUMN legacy_status status
      ENUM('0','1','2','3','4','5','6','7','8','9','10') NOT NULL DEFAULT '0'
    `);
  }
}
