import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropImplicitTenantDefaults1785169009000
  implements MigrationInterface
{
  name = 'DropImplicitTenantDefaults1785169009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ TABLE_NAME: string }> = await queryRunner.query(`
      SELECT TABLE_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'tenant_id'
        AND COLUMN_DEFAULT IS NOT NULL
    `);
    for (const row of rows) {
      const table = row.TABLE_NAME.replace(/`/g, '');
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ALTER COLUMN tenant_id DROP DEFAULT`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ TABLE_NAME: string }> = await queryRunner.query(`
      SELECT TABLE_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'tenant_id'
    `);
    for (const row of rows) {
      const table = row.TABLE_NAME.replace(/`/g, '');
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ALTER COLUMN tenant_id SET DEFAULT 1`,
      );
    }
  }
}
