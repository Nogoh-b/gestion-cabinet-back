import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDossierActivationControls1785169004000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dossiers'
         AND COLUMN_NAME IN (
           'conflict_check_status',
           'conflict_check_notes',
           'engagement_document_id',
           'financial_terms_confirmed'
         )`,
    );
    const existing = new Set(columns.map((column) => column.COLUMN_NAME));
    if (!existing.has('conflict_check_status')) {
      await queryRunner.query(`
        ALTER TABLE dossiers
        ADD COLUMN conflict_check_status
        ENUM('PENDING','CLEARED','WAIVED','BLOCKED') NOT NULL DEFAULT 'PENDING'
      `);
    }
    if (!existing.has('conflict_check_notes')) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN conflict_check_notes TEXT NULL`,
      );
    }
    if (!existing.has('engagement_document_id')) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN engagement_document_id INT NULL`,
      );
    }
    if (!existing.has('financial_terms_confirmed')) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN financial_terms_confirmed TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dossiers DROP COLUMN IF EXISTS financial_terms_confirmed`,
    );
    await queryRunner.query(
      `ALTER TABLE dossiers DROP COLUMN IF EXISTS engagement_document_id`,
    );
    await queryRunner.query(
      `ALTER TABLE dossiers DROP COLUMN IF EXISTS conflict_check_notes`,
    );
    await queryRunner.query(
      `ALTER TABLE dossiers DROP COLUMN IF EXISTS conflict_check_status`,
    );
  }
}
