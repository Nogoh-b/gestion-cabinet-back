import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAuthenticationOtp1785169016000
  implements MigrationInterface
{
  name = 'HardenAuthenticationOtp1785169016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE auth_tokens
      ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0 AFTER isUsed,
      ADD COLUMN last_attempt_at DATETIME NULL AFTER failed_attempts,
      ADD KEY idx_auth_token_rate (email, type, createdAt)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE auth_tokens DROP INDEX idx_auth_token_rate',
    );
    await queryRunner.query(`
      ALTER TABLE auth_tokens
      DROP COLUMN last_attempt_at,
      DROP COLUMN failed_attempts
    `);
  }
}
