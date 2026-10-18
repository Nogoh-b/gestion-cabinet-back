import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Portail client : messagerie client ↔ cabinet et provenance des paiements.
 *
 *  - `client_messages` : fil de discussion d'un client avec le cabinet
 *    (optionnellement rattaché à un dossier). Distinct du chat interne, qui
 *    repose sur des fiches employé.
 *  - `paiements.declared_by_client` : paiement déclaré depuis le portail
 *    (créé EN_ATTENTE, à approuver par le cabinet).
 *
 * Idempotent.
 */
export class ClientPortal1792400000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS client_messages (
        id INT NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        customer_id INT NOT NULL,
        dossier_id INT NULL,
        sender_type VARCHAR(10) NOT NULL,
        sender_user_id INT NULL,
        sender_name VARCHAR(150) NULL,
        content TEXT NOT NULL,
        read_by_client_at DATETIME NULL,
        read_by_cabinet_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        KEY IDX_client_messages_tenant (tenant_id),
        KEY IDX_client_messages_customer (tenant_id, customer_id, created_at),
        KEY IDX_client_messages_dossier (tenant_id, dossier_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!(await q.hasColumn('paiements', 'declared_by_client'))) {
      await q.query(
        `ALTER TABLE paiements ADD COLUMN declared_by_client TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasColumn('paiements', 'declared_by_client')) {
      await q.query(`ALTER TABLE paiements DROP COLUMN declared_by_client`);
    }
    await q.query(`DROP TABLE IF EXISTS client_messages`);
  }
}
