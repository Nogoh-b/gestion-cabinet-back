import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Espace plateforme (super admin) — socle :
 *   - platform_admins        : comptes plateforme (owner / finance / support)
 *   - platform_admin_tokens  : défis OTP, invitations, réinitialisations
 *   - platform_audit_logs    : journal des actions plateforme
 *   - platform_settings      : paramètres clé/valeur de la plateforme
 *
 * Tables AU NIVEAU PLATEFORME (aucun tenant_id). Idempotent.
 */
export class CreatePlatformCore1791700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_admins (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(150) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        password VARCHAR(100) NULL,
        role ENUM('owner','finance','support') NOT NULL DEFAULT 'support',
        status ENUM('active','disabled') NOT NULL DEFAULT 'active',
        token_version INT NOT NULL DEFAULT 0,
        failed_attempts INT NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        last_login_at DATETIME NULL,
        last_login_ip VARCHAR(64) NULL,
        created_by_admin_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_platform_admins_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_admin_tokens (
        id INT NOT NULL AUTO_INCREMENT,
        admin_id INT NOT NULL,
        purpose ENUM('login_otp','invite','reset_password') NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        code_hash VARCHAR(64) NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME NULL,
        ip VARCHAR(64) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_platform_admin_tokens_hash (token_hash),
        CONSTRAINT FK_platform_admin_tokens_admin FOREIGN KEY (admin_id)
          REFERENCES platform_admins (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_audit_logs (
        id INT NOT NULL AUTO_INCREMENT,
        admin_id INT NULL,
        admin_email VARCHAR(150) NULL,
        action VARCHAR(80) NOT NULL,
        target_type VARCHAR(50) NULL,
        target_id VARCHAR(64) NULL,
        cabinet_id INT NULL,
        summary VARCHAR(500) NULL,
        \`before\` JSON NULL,
        \`after\` JSON NULL,
        method VARCHAR(10) NULL,
        path VARCHAR(255) NULL,
        status_code SMALLINT NULL,
        outcome VARCHAR(10) NOT NULL DEFAULT 'success',
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_platform_audit_created (created_at),
        KEY IDX_platform_audit_cabinet (cabinet_id, created_at),
        KEY IDX_platform_audit_admin (admin_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        \`key\` VARCHAR(100) NOT NULL,
        value JSON NULL,
        updated_by_admin_id INT NULL,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS platform_settings`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform_audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform_admin_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS platform_admins`);
  }
}
