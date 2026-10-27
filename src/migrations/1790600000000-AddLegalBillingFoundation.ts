import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Fondations du modÃ¨le de facturation juridique.
 *
 * Cette migration reste volontairement additive : elle conserve les anciens
 * codes et champs afin que les Ã©crans existants puissent Ãªtre migrÃ©s par lots.
 */
export class AddLegalBillingFoundation1790600000000
  implements MigrationInterface
{
  name = 'AddLegalBillingFoundation1790600000000';

  private async addColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(table, column))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
      );
    }
  }

  private async dropColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn(table, column)) {
      await queryRunner.dropColumn(table, column);
    }
  }

  private async createIndex(
    queryRunner: QueryRunner,
    table: string,
    name: string,
    columnNames: string[],
    isUnique = false,
  ): Promise<void> {
    const metadata = await queryRunner.getTable(table);
    if (metadata && !metadata.indices.some((index) => index.name === name)) {
      await queryRunner.createIndex(
        table,
        new TableIndex({ name, columnNames, isUnique }),
      );
    }
  }

  private async dropIndex(
    queryRunner: QueryRunner,
    table: string,
    name: string,
  ): Promise<void> {
    const metadata = await queryRunner.getTable(table);
    if (metadata?.indices.some((index) => index.name === name)) {
      await queryRunner.dropIndex(table, name);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    // Les anciennes valeurs sont maintenues pour une transition sans rupture.
    await queryRunner.query(`
      ALTER TABLE \`dossier_actions\`
        MODIFY COLUMN \`billing_decision\`
        enum(
          'NOT_DECIDED','BILLABLE','INCLUDED_IN_PACKAGE','HOURLY','VACATION',
          'NON_BILLABLE','NEEDS_REVIEW'
        ) NOT NULL DEFAULT 'NOT_DECIDED'
    `);
    await queryRunner.query(`
      ALTER TABLE \`case_action_definitions\`
        MODIFY COLUMN \`billing_mode\`
        enum('FIXED','HOURLY','PERCENTAGE','EXPENSE','UNIT','ACTUAL_COST') NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`dossier_billing_rules\`
        MODIFY COLUMN \`calculation_mode\`
        enum('FIXED','HOURLY','PERCENTAGE','EXPENSE','UNIT','ACTUAL_COST') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`billable_items\`
        MODIFY COLUMN \`source_type\`
        enum(
          'OPENING_FEE','ACTION','AUDIENCE','DILIGENCE','MILESTONE','EXPENSE',
          'RESULT','MANUAL','ADJUSTMENT'
        ) NOT NULL
    `);

    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'opening_fee_enabled',
      'tinyint NOT NULL DEFAULT 0 AFTER `opening_fee`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'opening_fee_included_in_fixed_fee',
      'tinyint NOT NULL DEFAULT 0 AFTER `opening_fee_enabled`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'default_vacation_rate',
      'decimal(14,2) NULL AFTER `opening_fee_included_in_fixed_fee`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'result_fee_enabled',
      'tinyint NOT NULL DEFAULT 0 AFTER `default_vacation_rate`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'result_fee_rate',
      'decimal(8,4) NULL AFTER `result_fee_enabled`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'rebill_expenses',
      'tinyint NOT NULL DEFAULT 1 AFTER `result_fee_rate`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'rebill_disbursements',
      'tinyint NOT NULL DEFAULT 1 AFTER `rebill_expenses`',
    );
    await this.addColumn(
      queryRunner,
      'dossier_billing_profiles',
      'require_disbursement_receipt',
      'tinyint NOT NULL DEFAULT 1 AFTER `rebill_disbursements`',
    );

    await this.addColumn(
      queryRunner,
      'case_action_definitions',
      'default_professional_treatment',
      "enum('FOLLOW_DOSSIER','HOURLY','VACATION','NON_BILLABLE','NEEDS_REVIEW') NOT NULL DEFAULT 'FOLLOW_DOSSIER' AFTER `billable_by_default`",
    );
    await this.addColumn(
      queryRunner,
      'case_action_definitions',
      'may_have_expenses',
      'tinyint NOT NULL DEFAULT 0 AFTER `default_professional_treatment`',
    );
    await this.addColumn(
      queryRunner,
      'case_action_definitions',
      'may_have_disbursements',
      'tinyint NOT NULL DEFAULT 0 AFTER `may_have_expenses`',
    );

    await this.addColumn(
      queryRunner,
      'dossier_billing_rules',
      'category',
      "enum('OPENING_FEE','HONORARIUM','VACATION','EXPENSE','DISBURSEMENT','RESULT_FEE','ADJUSTMENT') NULL AFTER `trigger`",
    );

    await this.addColumn(
      queryRunner,
      'billable_items',
      'category',
      "enum('OPENING_FEE','HONORARIUM','VACATION','EXPENSE','DISBURSEMENT','RESULT_FEE','ADJUSTMENT') NOT NULL DEFAULT 'HONORARIUM' AFTER `source_type`",
    );
    await this.addColumn(
      queryRunner,
      'billable_items',
      'calculation_mode',
      "enum('FIXED','HOURLY','PERCENTAGE','EXPENSE','UNIT','ACTUAL_COST') NOT NULL DEFAULT 'FIXED' AFTER `category`",
    );
    await this.addColumn(
      queryRunner,
      'billable_items',
      'action_id',
      'varchar(36) NULL AFTER `source_id`',
    );
    await this.addColumn(
      queryRunner,
      'billable_items',
      'professional_action_key',
      "varchar(36) GENERATED ALWAYS AS (CASE WHEN `category` IN ('HONORARIUM','VACATION') THEN `action_id` ELSE NULL END) STORED AFTER `action_id`",
    );
    await this.addColumn(
      queryRunner,
      'billable_items',
      'billing_rule_id',
      'varchar(36) NULL AFTER `professional_action_key`',
    );
    await this.addColumn(
      queryRunner,
      'billable_items',
      'unit_label',
      'varchar(40) NULL AFTER `label`',
    );

    await this.addColumn(
      queryRunner,
      'invoice_lines',
      'category',
      "enum('OPENING_FEE','HONORARIUM','VACATION','EXPENSE','DISBURSEMENT','RESULT_FEE','ADJUSTMENT') NOT NULL DEFAULT 'HONORARIUM' AFTER `billable_item_id`",
    );
    await this.addColumn(
      queryRunner,
      'invoice_lines',
      'calculation_mode',
      "enum('FIXED','HOURLY','PERCENTAGE','EXPENSE','UNIT','ACTUAL_COST') NOT NULL DEFAULT 'FIXED' AFTER `category`",
    );
    await this.addColumn(
      queryRunner,
      'invoice_lines',
      'unit_label',
      'varchar(40) NULL AFTER `calculation_mode`',
    );
    await this.addColumn(
      queryRunner,
      'invoice_lines',
      'action_id',
      'varchar(36) NULL AFTER `unit_label`',
    );
    await this.addColumn(
      queryRunner,
      'invoice_lines',
      'billing_rule_id',
      'varchar(36) NULL AFTER `action_id`',
    );

    await this.addColumn(
      queryRunner,
      'expense_line',
      'rebilling_type',
      "enum('EXPENSE','DISBURSEMENT') NOT NULL DEFAULT 'EXPENSE' AFTER `is_rebillable`",
    );
    await this.addColumn(
      queryRunner,
      'expense_line',
      'action_id',
      'varchar(36) NULL AFTER `dossier_id`',
    );
    await this.addColumn(
      queryRunner,
      'expense_line',
      'currency',
      "varchar(10) NOT NULL DEFAULT 'XAF' AFTER `amount_ttc`",
    );

    // Reprises explicites des donnÃ©es historiques.
    await queryRunner.query(`
      UPDATE \`dossier_billing_profiles\`
         SET \`opening_fee_enabled\` = CASE
               WHEN \`opening_fee\` IS NOT NULL AND \`opening_fee\` > 0 THEN 1
               ELSE 0
             END,
             \`result_fee_enabled\` = CASE
               WHEN \`percentage_rate\` IS NOT NULL AND \`percentage_rate\` > 0
                 THEN 1 ELSE 0
             END,
             \`result_fee_rate\` = \`percentage_rate\`
    `);
    await queryRunner.query(`
      UPDATE \`case_action_definitions\`
         SET \`default_professional_treatment\` = CASE
               WHEN \`billable_by_default\` = 0 THEN 'NON_BILLABLE'
               WHEN \`billing_mode\` = 'HOURLY' THEN 'HOURLY'
               WHEN \`billing_mode\` = 'FIXED' THEN 'VACATION'
               ELSE 'NEEDS_REVIEW'
             END
    `);
    await queryRunner.query(`
      UPDATE \`billable_items\`
         SET \`category\` = CASE
               WHEN \`source_type\` = 'OPENING_FEE' THEN 'OPENING_FEE'
               WHEN \`source_type\` = 'ADJUSTMENT' THEN 'ADJUSTMENT'
               ELSE 'HONORARIUM'
             END,
             \`calculation_mode\` = CASE
               WHEN JSON_UNQUOTE(JSON_EXTRACT(\`calculation_snapshot\`, '$.mode')) = 'HOURLY'
                 THEN 'HOURLY'
               WHEN JSON_UNQUOTE(JSON_EXTRACT(\`calculation_snapshot\`, '$.mode')) = 'PERCENTAGE'
                 THEN 'PERCENTAGE'
               WHEN JSON_UNQUOTE(JSON_EXTRACT(\`calculation_snapshot\`, '$.mode')) = 'EXPENSE'
                 THEN 'EXPENSE'
               ELSE 'FIXED'
             END,
             \`action_id\` = CASE
               WHEN \`source_type\` = 'ACTION' THEN \`source_id\`
               ELSE NULL
             END,
             \`billing_rule_id\` = NULLIF(
               JSON_UNQUOTE(JSON_EXTRACT(\`calculation_snapshot\`, '$.billingRuleId')),
               'null'
             )
    `);
    await queryRunner.query(`
      UPDATE \`invoice_lines\` AS line
      INNER JOIN \`billable_items\` AS item
              ON item.id = line.billable_item_id
             AND item.tenant_id = line.tenant_id
         SET line.category = item.category,
             line.calculation_mode = item.calculation_mode,
             line.unit_label = item.unit_label,
             line.action_id = item.action_id,
             line.billing_rule_id = item.billing_rule_id
    `);
    await queryRunner.query(`
      UPDATE \`expense_line\`
         SET \`rebilling_type\` = CASE
               WHEN \`category\` IN ('bailiff', 'court_fees')
                 THEN 'DISBURSEMENT'
               ELSE 'EXPENSE'
             END
    `);

    await this.createIndex(
      queryRunner,
      'billable_items',
      'IDX_billable_item_category_status',
      ['tenant_id', 'dossier_id', 'category', 'status'],
    );
    await this.createIndex(
      queryRunner,
      'billable_items',
      'IDX_billable_item_action',
      ['tenant_id', 'action_id'],
    );
    await this.createIndex(
      queryRunner,
      'billable_items',
      'UQ_billable_item_professional_action',
      ['tenant_id', 'professional_action_key'],
      true,
    );
    await this.createIndex(
      queryRunner,
      'expense_line',
      'IDX_expense_line_action',
      ['tenant_id', 'action_id'],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(
      queryRunner,
      'expense_line',
      'IDX_expense_line_action',
    );
    await this.dropIndex(
      queryRunner,
      'billable_items',
      'IDX_billable_item_action',
    );
    await this.dropIndex(
      queryRunner,
      'billable_items',
      'UQ_billable_item_professional_action',
    );
    await this.dropIndex(
      queryRunner,
      'billable_items',
      'IDX_billable_item_category_status',
    );

    await queryRunner.query(`
      UPDATE \`dossier_actions\`
         SET \`billing_decision\` = CASE
               WHEN \`billing_decision\` IN ('HOURLY', 'VACATION') THEN 'BILLABLE'
               WHEN \`billing_decision\` = 'INCLUDED_IN_PACKAGE' THEN 'NON_BILLABLE'
               ELSE \`billing_decision\`
             END
    `);
    await queryRunner.query(`
      UPDATE \`case_action_definitions\`
         SET \`billing_mode\` = CASE
               WHEN \`billing_mode\` = 'UNIT' THEN 'FIXED'
               WHEN \`billing_mode\` = 'ACTUAL_COST' THEN 'EXPENSE'
               ELSE \`billing_mode\`
             END
    `);
    await queryRunner.query(`
      UPDATE \`dossier_billing_rules\`
         SET \`calculation_mode\` = CASE
               WHEN \`calculation_mode\` = 'UNIT' THEN 'FIXED'
               WHEN \`calculation_mode\` = 'ACTUAL_COST' THEN 'EXPENSE'
               ELSE \`calculation_mode\`
             END
    `);
    await queryRunner.query(`
      UPDATE \`billable_items\`
         SET \`source_type\` = CASE
               WHEN \`source_type\` = 'EXPENSE' THEN 'DILIGENCE'
               WHEN \`source_type\` IN ('MILESTONE', 'RESULT') THEN 'MANUAL'
               ELSE \`source_type\`
             END
    `);

    for (const column of [
      'billing_rule_id',
      'professional_action_key',
      'action_id',
      'unit_label',
      'calculation_mode',
      'category',
    ]) {
      await this.dropColumn(queryRunner, 'invoice_lines', column);
    }
    for (const column of [
      'billing_rule_id',
      'action_id',
      'unit_label',
      'calculation_mode',
      'category',
    ]) {
      await this.dropColumn(queryRunner, 'billable_items', column);
    }
    await this.dropColumn(queryRunner, 'dossier_billing_rules', 'category');
    for (const column of [
      'may_have_disbursements',
      'may_have_expenses',
      'default_professional_treatment',
    ]) {
      await this.dropColumn(queryRunner, 'case_action_definitions', column);
    }
    for (const column of [
      'require_disbursement_receipt',
      'rebill_disbursements',
      'rebill_expenses',
      'result_fee_rate',
      'result_fee_enabled',
      'default_vacation_rate',
      'opening_fee_included_in_fixed_fee',
      'opening_fee_enabled',
    ]) {
      await this.dropColumn(queryRunner, 'dossier_billing_profiles', column);
    }
    for (const column of ['action_id', 'rebilling_type', 'currency']) {
      await this.dropColumn(queryRunner, 'expense_line', column);
    }

    await queryRunner.query(`
      ALTER TABLE \`billable_items\`
        MODIFY COLUMN \`source_type\`
        enum('OPENING_FEE','ACTION','AUDIENCE','DILIGENCE','MANUAL','ADJUSTMENT') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`dossier_billing_rules\`
        MODIFY COLUMN \`calculation_mode\`
        enum('FIXED','HOURLY','PERCENTAGE','EXPENSE') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`case_action_definitions\`
        MODIFY COLUMN \`billing_mode\`
        enum('FIXED','HOURLY','PERCENTAGE','EXPENSE') NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`dossier_actions\`
        MODIFY COLUMN \`billing_decision\`
        enum('NOT_DECIDED','BILLABLE','NON_BILLABLE','NEEDS_REVIEW')
        NOT NULL DEFAULT 'NOT_DECIDED'
    `);
  }
}
