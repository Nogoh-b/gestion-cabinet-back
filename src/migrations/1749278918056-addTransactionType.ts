import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionType1749278918056 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO transaction_type (code, name, description, is_credit, fee_percentage, status)
      VALUES
        ('MOMO_DEPOSIT', 'Dépôt MOMO', 'Versement dans portefeuille mobile Mobile Money', 1, 0.00, 1),
        ('OM_DEPOSIT', 'Dépôt OM', 'Versement dans portefeuille mobile Orange Money', 1, 0.00, 1)
      ;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM transaction_type
      WHERE code IN ('MOMO_DEPOSIT', 'OM_DEPOSIT');
    `);
  }
}