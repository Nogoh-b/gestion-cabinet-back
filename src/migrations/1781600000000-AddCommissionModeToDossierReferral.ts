import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommissionModeToDossierReferral1781600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('dossier_referral', 'commission_mode'))) {
      await queryRunner.query(`
        ALTER TABLE dossier_referral
          ADD commission_mode ENUM('rate', 'fixed_amount') NOT NULL DEFAULT 'rate'
      `);
    }
    if (
      !(await queryRunner.hasColumn('dossier_referral', 'commission_amount'))
    ) {
      await queryRunner.query(`
        ALTER TABLE dossier_referral
          ADD commission_amount DECIMAL(15,2) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn('dossier_referral', 'commission_amount')
    ) {
      await queryRunner.query(
        'ALTER TABLE dossier_referral DROP COLUMN commission_amount',
      );
    }
    if (await queryRunner.hasColumn('dossier_referral', 'commission_mode')) {
      await queryRunner.query(
        'ALTER TABLE dossier_referral DROP COLUMN commission_mode',
      );
    }
  }
}
