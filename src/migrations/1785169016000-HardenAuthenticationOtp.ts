import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAuthenticationOtp1785169016000
  implements MigrationInterface
{
  name = 'HardenAuthenticationOtp1785169016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('auth_tokens'))) {
      await queryRunner.query(`
        CREATE TABLE auth_tokens (
          id VARCHAR(36) NOT NULL,
          email VARCHAR(255) NOT NULL,
          otp VARCHAR(255) NULL,
          type VARCHAR(255) NOT NULL,
          expiresAt TIMESTAMP NOT NULL,
          isUsed TINYINT NOT NULL DEFAULT 0,
          failed_attempts INT NOT NULL DEFAULT 0,
          last_attempt_at DATETIME NULL,
          token VARCHAR(255) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          KEY idx_auth_token_email (email),
          KEY idx_auth_token_rate (email, type, createdAt)
        ) ENGINE=InnoDB
      `);
      return;
    }

    if (!(await queryRunner.hasColumn('auth_tokens', 'failed_attempts'))) {
      await queryRunner.query(`
        ALTER TABLE auth_tokens
        ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0 AFTER isUsed
      `);
    }
    if (!(await queryRunner.hasColumn('auth_tokens', 'last_attempt_at'))) {
      await queryRunner.query(`
        ALTER TABLE auth_tokens
        ADD COLUMN last_attempt_at DATETIME NULL AFTER failed_attempts
      `);
    }
    if (!(await this.hasIndex(queryRunner, 'idx_auth_token_rate'))) {
      await queryRunner.query(`
        ALTER TABLE auth_tokens
        ADD KEY idx_auth_token_rate (email, type, createdAt)
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('auth_tokens'))) return;
    if (await this.hasIndex(queryRunner, 'idx_auth_token_rate')) {
      await queryRunner.query(
        'ALTER TABLE auth_tokens DROP INDEX idx_auth_token_rate',
      );
    }
    if (await queryRunner.hasColumn('auth_tokens', 'last_attempt_at')) {
      await queryRunner.query(
        'ALTER TABLE auth_tokens DROP COLUMN last_attempt_at',
      );
    }
    if (await queryRunner.hasColumn('auth_tokens', 'failed_attempts')) {
      await queryRunner.query(
        'ALTER TABLE auth_tokens DROP COLUMN failed_attempts',
      );
    }
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    name: string,
  ): Promise<boolean> {
    const indexes: Array<{ Key_name: string }> = await queryRunner.query(
      'SHOW INDEX FROM auth_tokens WHERE Key_name = ?',
      [name],
    );
    return indexes.length > 0;
  }
}
