import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avance sur salaire — suivi du remboursement & récupération automatique.
 *
 * 1. `payslip.advance_recovered_amount` : part de l'avance déjà récupérée sur
 *    des paies (reste à récupérer = advance_amount − advance_recovered_amount).
 * 2. `payslip_line.line_type` : nouvelle valeur d'enum `advance_recovery` pour
 *    la ligne de retenue qui solde la créance comptable (compte 425).
 *
 * Idempotent (garde `hasColumn` + MODIFY rejouable) car la base de dev tourne
 * en `synchronize:true`.
 */
export class PayslipAdvanceRecovery1779400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('payslip', 'advance_recovered_amount'))) {
      await queryRunner.query(
        `ALTER TABLE payslip ADD COLUMN advance_recovered_amount DECIMAL(12,2) NOT NULL DEFAULT 0`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE payslip_line MODIFY COLUMN line_type ` +
        `ENUM('base_salary','bonus','internal_commission','deduction','advance_recovery','benefit','overtime') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Repli : on retire la valeur d'enum (les lignes 'advance_recovery' éventuelles
    // doivent être nettoyées au préalable) puis la colonne.
    await queryRunner.query(
      `ALTER TABLE payslip_line MODIFY COLUMN line_type ` +
        `ENUM('base_salary','bonus','internal_commission','deduction','benefit','overtime') NOT NULL`,
    );

    if (await queryRunner.hasColumn('payslip', 'advance_recovered_amount')) {
      await queryRunner.query(`ALTER TABLE payslip DROP COLUMN advance_recovered_amount`);
    }
  }
}
