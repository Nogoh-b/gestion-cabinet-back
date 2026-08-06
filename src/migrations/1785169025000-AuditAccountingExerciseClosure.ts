import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditAccountingExerciseClosure1785169025000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('exercices_comptables', 'date_cloture')) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables
         MODIFY COLUMN date_cloture DATETIME(6) NULL`,
      );
    }
    if (
      !(await queryRunner.hasColumn(
        'exercices_comptables',
        'closing_report',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables
         ADD COLUMN closing_report TEXT NULL`,
      );
    }
    if (
      !(await queryRunner.hasColumn(
        'exercices_comptables',
        'reconciliation_reference',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables
         ADD COLUMN reconciliation_reference VARCHAR(255) NULL`,
      );
    }
    if (
      !(await queryRunner.hasColumn('exercices_comptables', 'closed_by'))
    ) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables
         ADD COLUMN closed_by VARCHAR(64) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('exercices_comptables', 'closed_by')) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables DROP COLUMN closed_by`,
      );
    }
    if (
      await queryRunner.hasColumn(
        'exercices_comptables',
        'reconciliation_reference',
      )
    ) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables
         DROP COLUMN reconciliation_reference`,
      );
    }
    if (
      await queryRunner.hasColumn('exercices_comptables', 'closing_report')
    ) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables DROP COLUMN closing_report`,
      );
    }
    if (await queryRunner.hasColumn('exercices_comptables', 'date_cloture')) {
      await queryRunner.query(
        `ALTER TABLE exercices_comptables
         MODIFY COLUMN date_cloture DATE NULL`,
      );
    }
  }
}
