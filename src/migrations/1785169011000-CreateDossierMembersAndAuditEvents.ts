import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDossierMembersAndAuditEvents1785169011000
  implements MigrationInterface
{
  name = 'CreateDossierMembersAndAuditEvents1785169011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_members (
        id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        dossier_id INT NOT NULL,
        user_id INT NOT NULL,
        role ENUM('RESPONSIBLE','LAWYER','COLLABORATOR','OBSERVER') NOT NULL,
        confidentiality_level TINYINT NOT NULL DEFAULT 0,
        valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        valid_until DATETIME NULL,
        revoked_at DATETIME NULL,
        revoked_by INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_dossier_member (tenant_id, dossier_id, user_id),
        KEY idx_dossier_member_access (tenant_id, user_id, revoked_at),
        KEY idx_dossier_member_dossier (tenant_id, dossier_id)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT IGNORE INTO dossier_members (
        id, tenant_id, dossier_id, user_id, role, confidentiality_level,
        valid_from, created_at, updated_at
      )
      SELECT UUID(), d.tenant_id, d.id, d.lawyer_id, 'RESPONSIBLE',
             IF(d.confidentiality_level = 1, 1, 0),
             COALESCE(d.created_at, UTC_TIMESTAMP()),
             UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
      FROM dossiers d
      WHERE d.lawyer_id IS NOT NULL
    `);

    if (await queryRunner.hasTable('dossier_collaborators')) {
      await queryRunner.query(`
        INSERT IGNORE INTO dossier_members (
          id, tenant_id, dossier_id, user_id, role, confidentiality_level,
          valid_from, created_at, updated_at
        )
        SELECT UUID(), d.tenant_id, dc.dossier_id, dc.user_id, 'COLLABORATOR',
               IF(d.confidentiality_level = 1, 1, 0),
               COALESCE(d.created_at, UTC_TIMESTAMP()),
               UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
        FROM dossier_collaborators dc
        INNER JOIN dossiers d ON d.id = dc.dossier_id
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_chain_heads (
        tenant_id INT NOT NULL,
        current_hash CHAR(64) NULL,
        current_event_id CHAR(36) NULL,
        sequence_no BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tenant_id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        actor_id VARCHAR(80) NULL,
        action VARCHAR(120) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id VARCHAR(100) NOT NULL,
        dossier_id INT NULL,
        before_state JSON NULL,
        after_state JSON NULL,
        justification TEXT NULL,
        ip VARCHAR(64) NULL,
        user_agent TEXT NULL,
        request_id VARCHAR(100) NULL,
        previous_hash CHAR(64) NULL,
        current_hash CHAR(64) NOT NULL,
        occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        KEY idx_audit_time (tenant_id, occurred_at),
        KEY idx_audit_resource (tenant_id, resource_type, resource_id),
        KEY idx_audit_dossier (tenant_id, dossier_id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_audit_events_no_update');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_audit_events_no_delete');
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_events_no_update
      BEFORE UPDATE ON audit_events
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_events is append-only'
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_events_no_delete
      BEFORE DELETE ON audit_events
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_events is append-only'
    `);

    await queryRunner.query(`
      SET @dossier_unique_index := (
        SELECT INDEX_NAME
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dossiers'
          AND COLUMN_NAME = 'dossier_number'
          AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1
        LIMIT 1
      )
    `);
    await queryRunner.query(`
      SET @drop_dossier_unique := IF(
        @dossier_unique_index IS NULL,
        'SELECT 1',
        CONCAT('ALTER TABLE dossiers DROP INDEX \`', @dossier_unique_index, '\`')
      )
    `);
    await queryRunner.query('PREPARE stmt FROM @drop_dossier_unique');
    await queryRunner.query('EXECUTE stmt');
    await queryRunner.query('DEALLOCATE PREPARE stmt');
    await queryRunner.query(`
      ALTER TABLE dossiers
      ADD UNIQUE KEY uq_dossier_tenant_number (tenant_id, dossier_number)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_audit_events_no_update');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_audit_events_no_delete');
    await queryRunner.query('DROP TABLE IF EXISTS audit_events');
    await queryRunner.query('DROP TABLE IF EXISTS audit_chain_heads');
    await queryRunner.query('DROP TABLE IF EXISTS dossier_members');
    await queryRunner.query(
      'ALTER TABLE dossiers DROP INDEX uq_dossier_tenant_number',
    );
    await queryRunner.query(
      'ALTER TABLE dossiers ADD UNIQUE KEY uq_dossier_number (dossier_number)',
    );
  }
}
