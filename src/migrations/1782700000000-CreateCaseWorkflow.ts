import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Parcours dossier V2 orienté actions.
 *
 * Les tables historiques ne sont ni modifiées fonctionnellement ni supprimées :
 * `dossiers.workflow_engine` permet une bascule progressive dossier par dossier.
 */
export class CreateCaseWorkflow1782700000000 implements MigrationInterface {
  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column],
    )) as unknown[];
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await this.columnExists(queryRunner, 'dossiers', 'lifecycle_phase'))
    ) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN lifecycle_phase enum('OPENING','TREATMENT','CLOSED') NOT NULL DEFAULT 'OPENING'`,
      );
    }
    if (
      !(await this.columnExists(queryRunner, 'dossiers', 'workflow_engine'))
    ) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN workflow_engine enum('LEGACY','ACTIONS_V2') NOT NULL DEFAULT 'LEGACY'`,
      );
    }
    if (
      !(await this.columnExists(
        queryRunner,
        'dossiers',
        'legacy_workflow_locked',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN legacy_workflow_locked tinyint NOT NULL DEFAULT 0`,
      );
    }
    if (
      !(await this.columnExists(
        queryRunner,
        'dossiers',
        'opening_validated_at',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN opening_validated_at datetime NULL`,
      );
    }
    if (
      !(await this.columnExists(
        queryRunner,
        'dossiers',
        'opening_validated_by',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE dossiers ADD COLUMN opening_validated_by int NULL`,
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_action_families (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        code varchar(80) NOT NULL,
        label varchar(160) NOT NULL,
        description text NULL,
        display_order int NOT NULL DEFAULT 0,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_case_action_family_tenant_code (tenant_id, code),
        KEY IDX_case_action_families_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_action_definitions (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        family_id varchar(36) NOT NULL,
        code varchar(100) NOT NULL,
        label varchar(200) NOT NULL,
        version int NOT NULL DEFAULT 1,
        specific_fields_schema json NULL,
        allowed_results json NULL,
        required_relations json NULL,
        default_due_days int NULL,
        default_priority enum('LOW','NORMAL','HIGH','CRITICAL') NOT NULL DEFAULT 'NORMAL',
        is_required tinyint NOT NULL DEFAULT 0,
        billable_by_default tinyint NOT NULL DEFAULT 0,
        billing_mode enum('FIXED','HOURLY','PERCENTAGE','EXPENSE') NULL,
        default_rate decimal(14,2) NULL,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_case_action_definition_version (tenant_id, code, version),
        KEY IDX_case_action_definition_active (tenant_id, is_active),
        CONSTRAINT FK_case_action_definition_family FOREIGN KEY (family_id) REFERENCES case_action_families(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_actions (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        definition_id varchar(36) NOT NULL,
        definition_code varchar(100) NOT NULL,
        definition_label varchar(200) NOT NULL,
        definition_version int NOT NULL,
        title varchar(255) NOT NULL,
        responsible_user_id int NULL,
        status enum('TODO','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED') NOT NULL DEFAULT 'TODO',
        priority enum('LOW','NORMAL','HIGH','CRITICAL') NOT NULL DEFAULT 'NORMAL',
        is_required tinyint NOT NULL DEFAULT 0,
        planned_at datetime NULL,
        due_at datetime NULL,
        started_at datetime NULL,
        completed_at datetime NULL,
        cancelled_at datetime NULL,
        result_code varchar(100) NULL,
        result_notes text NULL,
        duration_minutes int NULL,
        specific_data json NULL,
        billing_decision enum('NOT_DECIDED','BILLABLE','NON_BILLABLE','NEEDS_REVIEW') NOT NULL DEFAULT 'NOT_DECIDED',
        billing_reason text NULL,
        source_recommendation_id varchar(36) NULL,
        idempotency_key varchar(180) NULL,
        lock_version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_dossier_action_idempotency (tenant_id, idempotency_key),
        UNIQUE KEY UQ_dossier_action_source_recommendation (tenant_id, source_recommendation_id),
        KEY IDX_dossier_action_workspace (tenant_id, dossier_id, status),
        KEY IDX_dossier_action_definition (definition_id),
        CONSTRAINT FK_dossier_action_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dossier_action_definition FOREIGN KEY (definition_id) REFERENCES case_action_definitions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_action_document_links (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        action_id varchar(36) NOT NULL,
        document_id int NOT NULL,
        role enum('INPUT','OUTPUT','EVIDENCE','DEPENDS_ON') NOT NULL,
        requires_review tinyint NOT NULL DEFAULT 0,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_action_document_role (tenant_id, action_id, document_id, role),
        CONSTRAINT FK_action_document_action FOREIGN KEY (action_id) REFERENCES dossier_actions(id) ON DELETE CASCADE,
        CONSTRAINT FK_action_document_document FOREIGN KEY (document_id) REFERENCES document_customer(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_action_audience_links (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        action_id varchar(36) NOT NULL,
        audience_id int NOT NULL,
        role enum('INPUT','OUTPUT','EVIDENCE','DEPENDS_ON') NOT NULL,
        requires_review tinyint NOT NULL DEFAULT 0,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_action_audience_role (tenant_id, action_id, audience_id, role),
        CONSTRAINT FK_action_audience_action FOREIGN KEY (action_id) REFERENCES dossier_actions(id) ON DELETE CASCADE,
        CONSTRAINT FK_action_audience_audience FOREIGN KEY (audience_id) REFERENCES audiences(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_action_relations (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        action_id varchar(36) NOT NULL,
        related_action_id varchar(36) NOT NULL,
        role enum('INPUT','OUTPUT','EVIDENCE','DEPENDS_ON') NOT NULL DEFAULT 'DEPENDS_ON',
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_action_relation_role (tenant_id, action_id, related_action_id, role),
        CONSTRAINT FK_action_relation_action FOREIGN KEY (action_id) REFERENCES dossier_actions(id) ON DELETE CASCADE,
        CONSTRAINT FK_action_relation_related FOREIGN KEY (related_action_id) REFERENCES dossier_actions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_recommendation_rules (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        code varchar(100) NOT NULL,
        label varchar(200) NOT NULL,
        version int NOT NULL DEFAULT 1,
        \`trigger\` varchar(60) NOT NULL,
        condition_json json NOT NULL,
        action_definition_id varchar(36) NOT NULL,
        reason_template text NOT NULL,
        priority int NOT NULL DEFAULT 0,
        specificity int NOT NULL DEFAULT 0,
        due_offset_days int NULL,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_case_recommendation_rule_version (tenant_id, code, version),
        CONSTRAINT FK_case_recommendation_definition FOREIGN KEY (action_definition_id) REFERENCES case_action_definitions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_recommendations (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        rule_id varchar(36) NULL,
        rule_code varchar(100) NOT NULL,
        rule_version int NOT NULL,
        action_definition_id varchar(36) NOT NULL,
        reason text NOT NULL,
        status enum('ACTIVE','DEFERRED','ACCEPTED','SUPERSEDED','DISMISSED') NOT NULL DEFAULT 'ACTIVE',
        score int NOT NULL DEFAULT 0,
        due_at datetime NULL,
        remind_at datetime NULL,
        context_snapshot json NULL,
        source_event_key varchar(180) NOT NULL,
        lock_version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_dossier_recommendation_event (tenant_id, source_event_key, rule_version),
        KEY IDX_dossier_recommendation_current (tenant_id, dossier_id, status),
        CONSTRAINT FK_dossier_recommendation_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dossier_recommendation_rule FOREIGN KEY (rule_id) REFERENCES case_recommendation_rules(id) ON DELETE RESTRICT,
        CONSTRAINT FK_dossier_recommendation_definition FOREIGN KEY (action_definition_id) REFERENCES case_action_definitions(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_billing_profiles (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        currency varchar(10) NOT NULL DEFAULT 'XAF',
        vat_rate decimal(6,3) NOT NULL DEFAULT 0,
        mode enum('FIXED','HOURLY','PERCENTAGE','MIXED') NOT NULL DEFAULT 'FIXED',
        fixed_fee decimal(14,2) NULL,
        hourly_rate decimal(14,2) NULL,
        percentage_rate decimal(8,4) NULL,
        percentage_base decimal(14,2) NULL,
        opening_fee decimal(14,2) NULL,
        is_confirmed tinyint NOT NULL DEFAULT 0,
        lock_version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_dossier_billing_profile (tenant_id, dossier_id),
        CONSTRAINT FK_dossier_billing_profile_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_billing_rules (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        code varchar(100) NOT NULL,
        version int NOT NULL DEFAULT 1,
        \`trigger\` varchar(60) NOT NULL,
        calculation_mode enum('FIXED','HOURLY','PERCENTAGE','EXPENSE') NOT NULL,
        rate decimal(14,2) NULL,
        base_field varchar(120) NULL,
        fee_type varchar(120) NOT NULL,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_dossier_billing_rule_version (tenant_id, dossier_id, code, version),
        CONSTRAINT FK_dossier_billing_rule_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billable_items (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        client_id int NOT NULL,
        source_type enum('OPENING_FEE','ACTION','AUDIENCE','DILIGENCE','MANUAL','ADJUSTMENT') NOT NULL,
        source_id varchar(80) NOT NULL,
        source_event_key varchar(180) NOT NULL,
        occurred_at datetime NOT NULL,
        label varchar(255) NOT NULL,
        quantity decimal(14,4) NOT NULL DEFAULT 1,
        unit_price decimal(14,2) NOT NULL DEFAULT 0,
        net_amount decimal(14,2) NOT NULL DEFAULT 0,
        tax_rate decimal(6,3) NOT NULL DEFAULT 0,
        tax_amount decimal(14,2) NOT NULL DEFAULT 0,
        gross_amount decimal(14,2) NOT NULL DEFAULT 0,
        currency varchar(10) NOT NULL DEFAULT 'XAF',
        status enum('NEEDS_REVIEW','TO_INVOICE','RESERVED','INVOICED','WAIVED','ADJUSTED') NOT NULL DEFAULT 'TO_INVOICE',
        calculation_snapshot json NOT NULL,
        review_reason text NULL,
        reserved_at datetime NULL,
        invoice_line_id varchar(36) NULL,
        lock_version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_billable_item_source_event (tenant_id, source_event_key),
        KEY IDX_billable_item_selection (tenant_id, dossier_id, status, occurred_at),
        CONSTRAINT FK_billable_item_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_lines (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        facture_id varchar(36) NOT NULL,
        dossier_id int NOT NULL,
        billable_item_id varchar(36) NOT NULL,
        display_order int NOT NULL DEFAULT 0,
        label varchar(255) NOT NULL,
        quantity decimal(14,4) NOT NULL,
        unit_price decimal(14,2) NOT NULL,
        net_amount decimal(14,2) NOT NULL,
        tax_rate decimal(6,3) NOT NULL,
        tax_amount decimal(14,2) NOT NULL,
        gross_amount decimal(14,2) NOT NULL,
        currency varchar(10) NOT NULL,
        source_snapshot json NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_invoice_line_billable_item (tenant_id, billable_item_id),
        KEY IDX_invoice_line_facture (facture_id),
        CONSTRAINT FK_invoice_line_facture FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE RESTRICT,
        CONSTRAINT FK_invoice_line_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT,
        CONSTRAINT FK_invoice_line_billable FOREIGN KEY (billable_item_id) REFERENCES billable_items(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_workflow_features (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        enabled tinyint NOT NULL DEFAULT 0,
        default_for_new_dossiers tinyint NOT NULL DEFAULT 0,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_case_workflow_feature_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_workflow_events (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        event_type varchar(120) NOT NULL,
        aggregate_type varchar(80) NOT NULL,
        aggregate_id varchar(80) NOT NULL,
        actor_user_id int NULL,
        payload json NOT NULL,
        occurred_at datetime NOT NULL,
        idempotency_key varchar(180) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_case_workflow_event_idempotency (tenant_id, idempotency_key),
        KEY IDX_case_workflow_event_stream (tenant_id, dossier_id, occurred_at),
        CONSTRAINT FK_case_workflow_event_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_workflow_outbox (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        event_id varchar(36) NOT NULL,
        event_type varchar(120) NOT NULL,
        payload json NOT NULL,
        available_at datetime NOT NULL,
        processed_at datetime NULL,
        attempts int NOT NULL DEFAULT 0,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_case_workflow_outbox_event (tenant_id, event_id),
        CONSTRAINT FK_case_workflow_outbox_event FOREIGN KEY (event_id) REFERENCES case_workflow_events(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_closure_reviews (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        status enum('CHECKED','CLOSED','REOPENED') NOT NULL DEFAULT 'CHECKED',
        blockers json NOT NULL,
        warnings json NOT NULL,
        resolutions json NULL,
        justification text NULL,
        actor_user_id int NOT NULL,
        checked_at datetime NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        KEY IDX_dossier_closure_review (tenant_id, dossier_id, created_at),
        CONSTRAINT FK_dossier_closure_review_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS case_workflow_migration_runs (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        dossier_id int NOT NULL,
        status enum('PREVIEWED','APPLIED','CONFIRMED','ROLLED_BACK','FAILED') NOT NULL,
        mapping_version varchar(80) NOT NULL,
        legacy_snapshot json NOT NULL,
        preview_result json NOT NULL,
        applied_action_ids json NULL,
        actor_user_id int NOT NULL,
        confirmed_at datetime NULL,
        rolled_back_at datetime NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        KEY IDX_case_workflow_migration_dossier (tenant_id, dossier_id, created_at),
        CONSTRAINT FK_case_workflow_migration_dossier FOREIGN KEY (dossier_id) REFERENCES dossiers(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      UPDATE dossiers
         SET lifecycle_phase = CASE
           WHEN status IN (8, 9) THEN 'CLOSED'
           ELSE 'OPENING'
         END
       WHERE workflow_engine = 'LEGACY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'case_workflow_migration_runs',
      'dossier_closure_reviews',
      'case_workflow_outbox',
      'case_workflow_events',
      'case_workflow_features',
      'invoice_lines',
      'billable_items',
      'dossier_billing_rules',
      'dossier_billing_profiles',
      'dossier_recommendations',
      'case_recommendation_rules',
      'dossier_action_relations',
      'dossier_action_audience_links',
      'dossier_action_document_links',
      'dossier_actions',
      'case_action_definitions',
      'case_action_families',
    ];
    for (const table of tables)
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    for (const column of [
      'opening_validated_by',
      'opening_validated_at',
      'legacy_workflow_locked',
      'workflow_engine',
      'lifecycle_phase',
    ]) {
      if (await this.columnExists(queryRunner, 'dossiers', column)) {
        await queryRunner.query(
          `ALTER TABLE dossiers DROP COLUMN \`${column}\``,
        );
      }
    }
  }
}
