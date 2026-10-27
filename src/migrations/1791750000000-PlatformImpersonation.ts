import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Connexion « en tant que » (support plateforme) : chaque session est
 * nominative, motivée, limitée dans le temps et révocable. Le jeton cabinet
 * émis porte l'identifiant de session, revérifié à chaque requête.
 * Idempotent.
 */
export class PlatformImpersonation1791750000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS platform_impersonation_sessions (
        id INT NOT NULL AUTO_INCREMENT,
        admin_id INT NOT NULL,
        admin_email VARCHAR(150) NOT NULL,
        cabinet_id INT NOT NULL,
        user_id INT NOT NULL,
        user_email VARCHAR(150) NULL,
        reason VARCHAR(500) NOT NULL,
        started_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        ended_at DATETIME NULL,
        ended_by VARCHAR(20) NULL,
        ip VARCHAR(64) NULL,
        PRIMARY KEY (id),
        KEY IDX_impersonation_cabinet (cabinet_id, started_at),
        KEY IDX_impersonation_admin (admin_id, started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS platform_impersonation_sessions`);
  }
}
