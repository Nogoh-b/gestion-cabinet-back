import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Crédits IA : le quota mensuel d'un forfait n'est plus un nombre de requêtes
 * mais un budget de crédits (1 crédit = `usd_per_credit` USD de coût
 * fournisseur, réglage plateforme `ai_credits_v1`).
 *
 *  - `plans.ai_credits_per_month` : NULL ou -1 = illimité ;
 *  - `ai_credit_packs` : packs vendus par la plateforme ;
 *  - `ai_credit_ledger` : crédits achetés / offerts / remboursés / consommés au
 *    delà du forfait (dépassement mensuel unique par cabinet et par mois) ;
 *  - `subscription_payments` : un achat de pack est un paiement `kind =
 *    'ai_credits'` qui réutilise les passerelles existantes.
 *
 * `ai_requests_per_month` reste en base mais ne sert plus.
 */
export class AiCredits1793500000000 implements MigrationInterface {
  name = 'AiCredits1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('plans', 'ai_credits_per_month'))) {
      await queryRunner.addColumn(
        'plans',
        new TableColumn({ name: 'ai_credits_per_month', type: 'int', isNullable: true }),
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`ai_credit_packs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(120) NOT NULL,
        \`credits\` INT NOT NULL,
        \`price\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        \`currency\` VARCHAR(10) NOT NULL DEFAULT 'XAF',
        \`description\` VARCHAR(500) NULL,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_ai_credit_packs_active\` (\`is_active\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // credits signé : achat / attribution > 0, remboursement et dépassement < 0.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`ai_credit_ledger\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`tenant_id\` INT NOT NULL,
        \`kind\` ENUM('purchase','grant','overflow','refund') NOT NULL,
        \`credits\` DECIMAL(14,4) NOT NULL,
        \`payment_id\` INT NULL,
        \`period\` CHAR(7) NULL,
        \`note\` VARCHAR(255) NULL,
        \`created_by\` INT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_ai_credit_ledger_payment\` (\`payment_id\`),
        UNIQUE KEY \`UQ_ai_credit_ledger_period\` (\`tenant_id\`, \`kind\`, \`period\`),
        KEY \`IDX_ai_credit_ledger_tenant\` (\`tenant_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!(await queryRunner.hasColumn('subscription_payments', 'kind'))) {
      await queryRunner.addColumn(
        'subscription_payments',
        new TableColumn({ name: 'kind', type: 'varchar', length: '20', default: "'subscription'" }),
      );
      await queryRunner.query(
        'CREATE INDEX `IDX_subscription_payments_kind` ON `subscription_payments` (`kind`, `status`)',
      );
    }
    if (!(await queryRunner.hasColumn('subscription_payments', 'ai_credit_pack_id'))) {
      await queryRunner.addColumn(
        'subscription_payments',
        new TableColumn({ name: 'ai_credit_pack_id', type: 'int', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('subscription_payments', 'ai_credits'))) {
      await queryRunner.addColumn(
        'subscription_payments',
        new TableColumn({ name: 'ai_credits', type: 'decimal', precision: 14, scale: 4, isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['ai_credits', 'ai_credit_pack_id']) {
      if (await queryRunner.hasColumn('subscription_payments', column)) {
        await queryRunner.dropColumn('subscription_payments', column);
      }
    }
    if (await queryRunner.hasColumn('subscription_payments', 'kind')) {
      await queryRunner.query('DROP INDEX `IDX_subscription_payments_kind` ON `subscription_payments`');
      await queryRunner.dropColumn('subscription_payments', 'kind');
    }
    await queryRunner.query('DROP TABLE IF EXISTS `ai_credit_ledger`');
    await queryRunner.query('DROP TABLE IF EXISTS `ai_credit_packs`');
    if (await queryRunner.hasColumn('plans', 'ai_credits_per_month')) {
      await queryRunner.dropColumn('plans', 'ai_credits_per_month');
    }
  }
}
