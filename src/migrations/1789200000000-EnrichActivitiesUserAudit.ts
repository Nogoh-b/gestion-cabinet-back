import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnrichActivitiesUserAudit1789200000000
  implements MigrationInterface
{
  private async hasColumn(queryRunner: QueryRunner, column: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'activities_user'
         AND COLUMN_NAME = ? LIMIT 1`,
      [column],
    );
    return rows.length > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      ['resource_name', 'varchar(255) NULL AFTER resource_id'],
      ['resource_url', 'varchar(500) NULL AFTER resource_name'],
      ['event_details', 'json NULL AFTER resource_url'],
    ] as const;

    for (const [name, definition] of columns) {
      if (!(await this.hasColumn(queryRunner, name))) {
        await queryRunner.query(
          `ALTER TABLE activities_user ADD COLUMN ${name} ${definition}`,
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['event_details', 'resource_url', 'resource_name']) {
      if (await this.hasColumn(queryRunner, column)) {
        await queryRunner.query(
          `ALTER TABLE activities_user DROP COLUMN ${column}`,
        );
      }
    }
  }
}
