import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduit les règles de délais versionnées et leurs résultats calculés.
 * Aucune valeur procédurale n'est recopiée dans le dossier : l'éventuelle
 * conséquence d'une échéance est un événement que le template peut écouter.
 */
export class LegalDeadlineRules1785169041000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_deadline_rules (
        id INT NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        family_key VARCHAR(80) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        name VARCHAR(160) NOT NULL,
        status ENUM('DRAFT','ACTIVE','RETIRED') NOT NULL DEFAULT 'DRAFT',
        jurisdiction_id INT NULL,
        procedure_type_id INT NULL,
        decision_outcome VARCHAR(80) NULL,
        notification_method ENUM(
          'PERSONAL_SERVICE','REGISTRY','ELECTRONIC','POSTAL','OTHER'
        ) NOT NULL,
        duration_value INT NOT NULL,
        duration_unit ENUM(
          'CALENDAR_DAYS','BUSINESS_DAYS','MONTHS'
        ) NOT NULL,
        include_start_day TINYINT(1) NOT NULL DEFAULT 0,
        expiry_event VARCHAR(120) NULL,
        warning_offsets JSON NOT NULL,
        priority INT NOT NULL DEFAULT 0,
        effective_from DATETIME(6) NULL,
        effective_to DATETIME(6) NULL,
        activated_at DATETIME(6) NULL,
        retired_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_legal_deadline_rule_tenant_family_version
          (tenant_id, family_key, version),
        KEY IDX_legal_deadline_rule_match
          (tenant_id, status, notification_method),
        KEY IDX_legal_deadline_rule_jurisdiction
          (tenant_id, jurisdiction_id),
        KEY IDX_legal_deadline_rule_procedure
          (tenant_id, procedure_type_id)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_deadlines (
        id INT NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        audience_id INT NOT NULL,
        dossier_id INT NOT NULL,
        procedure_instance_id VARCHAR(36) NULL,
        rule_id INT NOT NULL,
        rule_family_key VARCHAR(80) NOT NULL,
        rule_version INT NOT NULL,
        duration_unit ENUM(
          'CALENDAR_DAYS','BUSINESS_DAYS','MONTHS'
        ) NOT NULL,
        duration_value INT NOT NULL,
        notification_method ENUM(
          'PERSONAL_SERVICE','REGISTRY','ELECTRONIC','POSTAL','OTHER'
        ) NOT NULL,
        notification_reference VARCHAR(190) NULL,
        notified_at_utc DATETIME(6) NOT NULL,
        due_at_utc DATETIME(6) NOT NULL,
        timezone VARCHAR(64) NOT NULL,
        status ENUM('OPEN','COMPLETED','CANCELLED','EXPIRED')
          NOT NULL DEFAULT 'OPEN',
        expiry_event VARCHAR(120) NULL,
        idempotency_key VARCHAR(190) NOT NULL,
        completed_at DATETIME(6) NULL,
        cancelled_at DATETIME(6) NULL,
        expired_at DATETIME(6) NULL,
        closure_reason TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_legal_deadline_tenant_idempotency
          (tenant_id, idempotency_key),
        KEY IDX_legal_deadline_due (tenant_id, status, due_at_utc),
        KEY IDX_legal_deadline_dossier (tenant_id, dossier_id),
        KEY IDX_legal_deadline_audience (tenant_id, audience_id),
        CONSTRAINT FK_legal_deadline_audience
          FOREIGN KEY (audience_id) REFERENCES audiences(id)
          ON UPDATE RESTRICT ON DELETE RESTRICT,
        CONSTRAINT FK_legal_deadline_rule
          FOREIGN KEY (rule_id) REFERENCES legal_deadline_rules(id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_deadline_warning_deliveries (
        event_id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        deadline_id INT NOT NULL,
        notification_id INT NULL,
        idempotency_key VARCHAR(190) NOT NULL,
        status ENUM('PROCESSING','DELIVERED','FAILED')
          NOT NULL DEFAULT 'PROCESSING',
        recipient_count INT NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        created_at DATETIME(6) NOT NULL,
        updated_at DATETIME(6) NOT NULL,
        delivered_at DATETIME(6) NULL,
        PRIMARY KEY (event_id),
        UNIQUE KEY UQ_legal_deadline_warning_tenant_key
          (tenant_id, idempotency_key),
        KEY IDX_legal_deadline_warning_deadline
          (tenant_id, deadline_id, status),
        CONSTRAINT FK_legal_deadline_warning_deadline
          FOREIGN KEY (deadline_id) REFERENCES legal_deadlines(id)
          ON UPDATE RESTRICT ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS legal_deadline_warning_deliveries`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS legal_deadlines`);
    await queryRunner.query(`DROP TABLE IF EXISTS legal_deadline_rules`);
  }
}
