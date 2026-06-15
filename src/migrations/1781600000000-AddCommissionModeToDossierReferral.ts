import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommissionModeToDossierReferral1781600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dossier_referral
        ADD commission_mode ENUM('rate', 'fixed_amount') NOT NULL DEFAULT 'rate',
        ADD commission_amount DECIMAL(15,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dossier_referral
        DROP COLUMN commission_amount,
        DROP COLUMN commission_mode
    `);
  }
}
