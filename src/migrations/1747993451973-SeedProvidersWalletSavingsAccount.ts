// src/migrations/20250523-SeedProvidersWalletSavingsAccount.ts
// Migration TypeORM: ajoute les providers 'WALLET' et 'SAVINGS_ACCOUNT'
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedProvidersWalletSavingsAccount20250523100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO core_banking.provider (code, name, status)
      VALUES
        ('WALLET', 'Wallet Service', 1),
        ('SAVINGS_ACCOUNT', 'Savings Account Service', 1)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        status = VALUES(status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM core_banking.provider
      WHERE code IN ('WALLET', 'SAVINGS_ACCOUNT');
    `);
  }
}