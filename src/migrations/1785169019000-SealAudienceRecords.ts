import { MigrationInterface, QueryRunner } from 'typeorm';

const RECORD_COLUMNS: Record<string, string> = {
  report_record_status:
    "ENUM('DRAFT','VALIDATED','SEALED') NOT NULL DEFAULT 'DRAFT'",
  report_record_version: 'INT NOT NULL DEFAULT 1',
  report_record_hash: 'CHAR(64) NULL',
  report_sealed_at: 'DATETIME(6) NULL',
  decision_record_status:
    "ENUM('DRAFT','VALIDATED','SEALED') NOT NULL DEFAULT 'DRAFT'",
  decision_record_version: 'INT NOT NULL DEFAULT 1',
  decision_record_hash: 'CHAR(64) NULL',
  decision_sealed_at: 'DATETIME(6) NULL',
};

export class SealAudienceRecords1785169019000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, definition] of Object.entries(RECORD_COLUMNS)) {
      if (!(await queryRunner.hasColumn('audiences', column))) {
        await queryRunner.query(
          `ALTER TABLE audiences ADD COLUMN \`${column}\` ${definition}`,
        );
      }
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audience_record_revisions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        audience_id INT NOT NULL,
        record_type ENUM('REPORT','DECISION') NOT NULL,
        version INT NOT NULL,
        record_status ENUM('DRAFT','VALIDATED','SEALED') NOT NULL,
        content JSON NOT NULL,
        content_hash CHAR(64) NULL,
        amendment_reason TEXT NULL,
        amended_by VARCHAR(80) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_audience_record_revision
          (tenant_id, audience_id, record_type, version),
        KEY IDX_audience_record_revision_lookup
          (tenant_id, audience_id, record_type, created_at)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audience_record_revisions`);
    for (const column of Object.keys(RECORD_COLUMNS).reverse()) {
      if (await queryRunner.hasColumn('audiences', column)) {
        await queryRunner.query(
          `ALTER TABLE audiences DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
