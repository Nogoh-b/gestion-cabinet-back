import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supprime les 3 colonnes legacy liées au modèle "avance = fiche de paie".
 * Depuis la refonte (juin 2026), les avances sont gérées par l'entité `salary_advance`.
 *
 * Colonnes supprimées :
 *   - payslip.is_advance          (TINYINT(1), default 0)
 *   - payslip.advance_amount      (DECIMAL 12,2, nullable)
 *   - payslip.advance_recovered_amount  (DECIMAL 12,2, default 0)
 *
 * La migration est idempotente : elle vérifie l'existence avant de supprimer.
 */
export class DropPayslipLegacyAdvanceColumns1779600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('payslip', 'is_advance')) {
      await queryRunner.query(
        `ALTER TABLE payslip DROP COLUMN is_advance`,
      );
    }

    if (await queryRunner.hasColumn('payslip', 'advance_amount')) {
      await queryRunner.query(
        `ALTER TABLE payslip DROP COLUMN advance_amount`,
      );
    }

    if (await queryRunner.hasColumn('payslip', 'advance_recovered_amount')) {
      await queryRunner.query(
        `ALTER TABLE payslip DROP COLUMN advance_recovered_amount`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrée les colonnes dans leur état d'origine (restauration données historiques non garantie)
    if (!(await queryRunner.hasColumn('payslip', 'is_advance'))) {
      await queryRunner.query(
        `ALTER TABLE payslip ADD COLUMN is_advance TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }

    if (!(await queryRunner.hasColumn('payslip', 'advance_amount'))) {
      await queryRunner.query(
        `ALTER TABLE payslip ADD COLUMN advance_amount DECIMAL(12,2) NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('payslip', 'advance_recovered_amount'))) {
      await queryRunner.query(
        `ALTER TABLE payslip ADD COLUMN advance_recovered_amount DECIMAL(12,2) NOT NULL DEFAULT 0`,
      );
    }
  }
}
