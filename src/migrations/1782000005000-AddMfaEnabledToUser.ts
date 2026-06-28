import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute `mfa_enabled` (double authentification OTP e-mail) à la table `user`.
 * Idempotent.
 */
export class AddMfaEnabledToUser1782000005000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'user'
         AND COLUMN_NAME = 'mfa_enabled'`,
    );
    if (!cols.length) {
      await queryRunner.query(
        `ALTER TABLE user ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user DROP COLUMN IF EXISTS mfa_enabled`,
    );
  }
}
