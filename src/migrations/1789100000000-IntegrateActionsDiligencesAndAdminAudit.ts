import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrateActionsDiligencesAndAdminAudit1789100000000
  implements MigrationInterface
{
  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column],
    );
    return rows.length > 0;
  }

  private async indexExists(
    queryRunner: QueryRunner,
    table: string,
    index: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [table, index],
    );
    return rows.length > 0;
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE diligences MODIFY COLUMN type
       enum('general','acquisition','investment','ipo','compliance','litigation','contract')
       NOT NULL DEFAULT 'acquisition'`,
    );
    if (!(await this.columnExists(queryRunner, 'diligences', 'source_action_id'))) {
      await queryRunner.query(
        `ALTER TABLE diligences ADD COLUMN source_action_id varchar(36) NULL AFTER assigned_lawyer_id`,
      );
    }
    if (!(await this.indexExists(queryRunner, 'diligences', 'UQ_diligence_source_action'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX UQ_diligence_source_action
         ON diligences (tenant_id, source_action_id)`,
      );
    }

    const auditColumns = [
      ['authorization_result', `varchar(20) NULL`],
      ['required_permissions', `json NULL`],
      ['granted_permissions', `json NULL`],
      ['risk_level', `varchar(20) NOT NULL DEFAULT 'none'`],
      ['error_message', `varchar(255) NULL`],
    ] as const;
    for (const [column, definition] of auditColumns) {
      if (!(await this.columnExists(queryRunner, 'activities_user', column))) {
        await queryRunner.query(
          `ALTER TABLE activities_user ADD COLUMN ${column} ${definition}`,
        );
      }
    }
    if (!(await this.indexExists(queryRunner, 'activities_user', 'IDX_activities_tenant_risk_date'))) {
      await queryRunner.query(
        `CREATE INDEX IDX_activities_tenant_risk_date
         ON activities_user (tenant_id, risk_level, created_at)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'activities_user', 'IDX_activities_tenant_risk_date')) {
      await queryRunner.query(
        `DROP INDEX IDX_activities_tenant_risk_date ON activities_user`,
      );
    }
    for (const column of [
      'error_message',
      'risk_level',
      'granted_permissions',
      'required_permissions',
      'authorization_result',
    ]) {
      if (await this.columnExists(queryRunner, 'activities_user', column)) {
        await queryRunner.query(
          `ALTER TABLE activities_user DROP COLUMN ${column}`,
        );
      }
    }
    if (await this.indexExists(queryRunner, 'diligences', 'UQ_diligence_source_action')) {
      await queryRunner.query(`DROP INDEX UQ_diligence_source_action ON diligences`);
    }
    if (await this.columnExists(queryRunner, 'diligences', 'source_action_id')) {
      await queryRunner.query(`ALTER TABLE diligences DROP COLUMN source_action_id`);
    }
    await queryRunner.query(
      `ALTER TABLE diligences MODIFY COLUMN type
       enum('acquisition','investment','ipo','compliance','litigation','contract')
       NOT NULL DEFAULT 'acquisition'`,
    );
  }
}
