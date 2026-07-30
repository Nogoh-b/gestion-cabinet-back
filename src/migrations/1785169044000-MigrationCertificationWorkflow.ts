import { MigrationInterface, QueryRunner } from 'typeorm';

const ISSUE_TABLES = [
  'supplier_evidence_migration_issues',
  'referral_commission_migration_issues',
  'chat_attachment_migration_report',
] as const;

/**
 * Rend les reprises de données explicitement clôturables et auditables.
 *
 * Les tables de problèmes créées par les migrations précédentes ne doivent
 * pas être de simples journaux sans issue : chaque anomalie doit pouvoir être
 * résolue ou faire l'objet d'une acceptation de risque motivée avant bascule.
 */
export class MigrationCertificationWorkflow1785169044000
  implements MigrationInterface
{
  name = 'MigrationCertificationWorkflow1785169044000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasTable('dossier_lifecycle_migration_audit')
    ) {
      if (
        !(await queryRunner.hasColumn(
          'dossier_lifecycle_migration_audit',
          'review_status',
        ))
      ) {
        await queryRunner.query(`
          ALTER TABLE dossier_lifecycle_migration_audit
          ADD COLUMN review_status
            ENUM('NOT_REQUIRED','PENDING','VALIDATED','REJECTED')
            NOT NULL DEFAULT 'NOT_REQUIRED',
          ADD COLUMN reviewed_by_id INT NULL,
          ADD COLUMN review_note TEXT NULL,
          ADD COLUMN reviewed_at DATETIME(6) NULL
        `);
      }
      await queryRunner.query(`
        UPDATE dossier_lifecycle_migration_audit
        SET review_status = CASE
          WHEN requires_review = 1 THEN 'PENDING'
          ELSE 'NOT_REQUIRED'
        END
        WHERE review_status = 'NOT_REQUIRED'
      `);
    }

    for (const table of ISSUE_TABLES) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (!(await queryRunner.hasColumn(table, 'resolution_status'))) {
        await queryRunner.query(`
          ALTER TABLE ${table}
          ADD COLUMN resolution_status
            ENUM('PENDING','RESOLVED','ACCEPTED_RISK')
            NOT NULL DEFAULT 'PENDING',
          ADD COLUMN resolved_by_id INT NULL,
          ADD COLUMN resolution_note TEXT NULL,
          ADD COLUMN resolved_at DATETIME(6) NULL
        `);
      }
    }

    if (await queryRunner.hasTable('chat_attachment_migration_report')) {
      await queryRunner.query(`
        UPDATE chat_attachment_migration_report
        SET resolution_status = 'RESOLVED',
            resolution_note = COALESCE(
              resolution_note,
              'Migration automatique vérifiée'
            ),
            resolved_at = COALESCE(resolved_at, migrated_at)
        WHERE migration_status IN ('MIGRATED', 'ALREADY_MIGRATED')
          AND resolution_status = 'PENDING'
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [...ISSUE_TABLES].reverse()) {
      if (!(await queryRunner.hasTable(table))) continue;
      for (const column of [
        'resolved_at',
        'resolution_note',
        'resolved_by_id',
        'resolution_status',
      ]) {
        if (await queryRunner.hasColumn(table, column)) {
          await queryRunner.query(
            `ALTER TABLE ${table} DROP COLUMN ${column}`,
          );
        }
      }
    }

    if (
      await queryRunner.hasTable('dossier_lifecycle_migration_audit')
    ) {
      for (const column of [
        'reviewed_at',
        'review_note',
        'reviewed_by_id',
        'review_status',
      ]) {
        if (
          await queryRunner.hasColumn(
            'dossier_lifecycle_migration_audit',
            column,
          )
        ) {
          await queryRunner.query(
            `ALTER TABLE dossier_lifecycle_migration_audit DROP COLUMN ${column}`,
          );
        }
      }
    }
  }
}
