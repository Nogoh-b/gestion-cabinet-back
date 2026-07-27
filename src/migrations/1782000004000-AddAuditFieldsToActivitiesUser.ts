import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enrichit `activities_user` pour servir de journal d'audit :
 * action, resource, resource_id, method, path, status_code, ip, summary.
 * Idempotent (ajoute chaque colonne si absente).
 */
export class AddAuditFieldsToActivitiesUser1782000004000
  implements MigrationInterface
{
  private readonly columns: Array<{ name: string; ddl: string }> = [
    { name: 'action', ddl: 'VARCHAR(20) NULL' },
    { name: 'resource', ddl: 'VARCHAR(80) NULL' },
    { name: 'resource_id', ddl: 'VARCHAR(64) NULL' },
    { name: 'method', ddl: 'VARCHAR(10) NULL' },
    { name: 'path', ddl: 'VARCHAR(255) NULL' },
    { name: 'status_code', ddl: 'INT NULL' },
    { name: 'ip', ddl: 'VARCHAR(64) NULL' },
    { name: 'summary', ddl: 'VARCHAR(255) NULL' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities_user'`,
    );
    const have = new Set(existing.map((c) => c.COLUMN_NAME));
    for (const col of this.columns) {
      if (!have.has(col.name)) {
        await queryRunner.query(
          `ALTER TABLE activities_user ADD COLUMN ${col.name} ${col.ddl}`,
        );
      }
    }

    // type_activities_user était NOT NULL : on le rend nullable (l'audit ne le
    // remplit pas toujours).
    await queryRunner.query(
      `ALTER TABLE activities_user MODIFY COLUMN type_activities_user VARCHAR(45) NULL`,
    );

    const idx: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities_user'
         AND INDEX_NAME = 'IDX_activities_tenant_date'`,
    );
    if (!idx.length) {
      await queryRunner.query(
        `CREATE INDEX IDX_activities_tenant_date ON activities_user (tenant_id, created_at)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IDX_activities_tenant_date ON activities_user`,
    );
    for (const col of this.columns) {
      await queryRunner.query(
        `ALTER TABLE activities_user DROP COLUMN IF EXISTS ${col.name}`,
      );
    }
  }
}
