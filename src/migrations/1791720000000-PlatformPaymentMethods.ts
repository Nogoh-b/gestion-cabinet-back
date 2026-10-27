import { MigrationInterface, QueryRunner } from 'typeorm';

async function columnExists(q: QueryRunner, table: string, column: string) {
  const rows: Array<{ n: number }> = await q.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0]?.n) > 0;
}

async function addColumn(q: QueryRunner, table: string, column: string, definition: string) {
  if (!(await columnExists(q, table, column))) {
    await q.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function addIndex(q: QueryRunner, table: string, index: string, columns: string, unique = false) {
  const rows: Array<{ n: number }> = await q.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index],
  );
  if (!Number(rows[0]?.n)) {
    await q.query(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX \`${index}\` ON \`${table}\` (${columns})`);
  }
}

/**
 * Moyens de paiement des abonnements :
 *   - platform_payment_methods : moyens manuels (virement, Mobile Money,
 *     espèces) et passerelles (CinetPay, NotchPay, Stripe, test), clés
 *     chiffrées (AES-256-GCM) ;
 *   - subscription_payments : statuts `awaiting_validation` / `cancelled`,
 *     déclaration manuelle, validation, remboursement, frais, reçu ;
 *   - payment_webhook_events : journal des notifications reçues (signature,
 *     traitement, anti-rejeu).
 *
 * Les échéances `pending` d'abonnements déjà remplacés (annulés) sont
 * annulées : elles ne sont plus exigibles. Idempotent.
 */
export class PlatformPaymentMethods1791720000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS platform_payment_methods (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(40) NOT NULL,
        label VARCHAR(100) NOT NULL,
        kind ENUM('gateway','manual') NOT NULL,
        provider VARCHAR(30) NULL,
        mode ENUM('sandbox','live') NOT NULL DEFAULT 'sandbox',
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        secret_config TEXT NULL,
        public_config JSON NULL,
        currencies JSON NULL,
        fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
        fee_fixed DECIMAL(10,2) NOT NULL DEFAULT 0,
        min_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_platform_payment_methods_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Moyens proposés par défaut (tous inactifs : à configurer par la plateforme).
    const defaults: Array<[string, string, string, string | null, number, object]> = [
      ['bank_transfer', 'Virement bancaire', 'manual', null, 10, { instructions: 'Effectuez le virement sur le compte ci-dessous en indiquant la référence de votre échéance, puis déclarez le paiement.', bank_name: '', account_holder: '', iban: '', swift: '' }],
      ['mobile_money_manual', 'Mobile Money (transfert direct)', 'manual', null, 20, { instructions: 'Envoyez le montant au numéro ci-dessous, puis déclarez le paiement avec l’identifiant de transaction reçu par SMS.', numbers: '' }],
      ['cash', 'Espèces (en agence)', 'manual', null, 90, { instructions: 'Réglez en espèces auprès de notre équipe ; un reçu vous sera remis.' }],
      ['cinetpay', 'Mobile Money / Carte (CinetPay)', 'gateway', 'cinetpay', 30, { channels: 'ALL' }],
      ['notchpay', 'Mobile Money (NotchPay)', 'gateway', 'notchpay', 40, {}],
      ['stripe', 'Carte bancaire (Stripe)', 'gateway', 'stripe', 50, {}],
    ];
    for (const [code, label, kind, provider, sort, publicConfig] of defaults) {
      await q.query(
        `INSERT IGNORE INTO platform_payment_methods
           (code, label, kind, provider, mode, is_active, public_config, currencies, sort_order)
         VALUES (?, ?, ?, ?, 'sandbox', 0, ?, ?, ?)`,
        [code, label, kind, provider, JSON.stringify(publicConfig), JSON.stringify(['XAF']), sort],
      );
    }

    await q.query(`
      ALTER TABLE subscription_payments
      MODIFY COLUMN status
      ENUM('pending','awaiting_validation','paid','failed','refunded','cancelled')
      NOT NULL DEFAULT 'pending'
    `);
    const cols: Array<[string, string]> = [
      ['payment_method_id', 'payment_method_id INT NULL'],
      ['provider_reference', 'provider_reference VARCHAR(255) NULL'],
      ['amount_gross', 'amount_gross DECIMAL(10,2) NULL'],
      ['discount_amount', 'discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0'],
      ['fee_amount', 'fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0'],
      ['failure_reason', 'failure_reason VARCHAR(255) NULL'],
      ['declared_reference', 'declared_reference VARCHAR(120) NULL'],
      ['declared_at', 'declared_at DATETIME NULL'],
      ['proof_file', 'proof_file VARCHAR(255) NULL'],
      ['validated_by_admin_id', 'validated_by_admin_id INT NULL'],
      ['validated_at', 'validated_at DATETIME NULL'],
      ['refunded_at', 'refunded_at DATETIME NULL'],
      ['refund_amount', 'refund_amount DECIMAL(10,2) NULL'],
      ['refund_reason', 'refund_reason VARCHAR(255) NULL'],
      ['receipt_number', 'receipt_number VARCHAR(40) NULL'],
      ['provider_payload', 'provider_payload JSON NULL'],
      ['notes', 'notes VARCHAR(500) NULL'],
    ];
    for (const [name, definition] of cols) {
      await addColumn(q, 'subscription_payments', name, definition);
    }
    await addIndex(q, 'subscription_payments', 'IDX_subscription_payments_status_paid', 'status, paid_at');
    await addIndex(q, 'subscription_payments', 'IDX_subscription_payments_paid_at', 'paid_at');
    await addIndex(q, 'subscription_payments', 'IDX_subscription_payments_refunded_at', 'refunded_at');
    await addIndex(q, 'subscription_payments', 'IDX_subscription_payments_reference', 'reference');
    await addIndex(q, 'subscription_payments', 'UQ_subscription_payments_receipt', 'receipt_number', true);

    await q.query(`
      UPDATE subscription_payments sp
        JOIN subscriptions s ON s.id = sp.subscription_id
         SET sp.status = 'cancelled',
             sp.notes = 'Échéance d''un abonnement remplacé'
       WHERE sp.status = 'pending' AND s.status = 'cancelled'
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id INT NOT NULL AUTO_INCREMENT,
        provider VARCHAR(30) NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        payment_id INT NULL,
        reference VARCHAR(255) NULL,
        signature_valid TINYINT(1) NOT NULL DEFAULT 0,
        payload JSON NULL,
        processed_at DATETIME NULL,
        error VARCHAR(500) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_payment_webhook_events (provider, event_id),
        KEY IDX_payment_webhook_events_payment (payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS payment_webhook_events`);
    for (const index of [
      'UQ_subscription_payments_receipt',
      'IDX_subscription_payments_reference',
      'IDX_subscription_payments_refunded_at',
      'IDX_subscription_payments_paid_at',
      'IDX_subscription_payments_status_paid',
    ]) {
      await q.query(`DROP INDEX IF EXISTS \`${index}\` ON subscription_payments`);
    }
    for (const column of [
      'notes', 'provider_payload', 'receipt_number', 'refund_reason', 'refund_amount',
      'refunded_at', 'validated_at', 'validated_by_admin_id', 'proof_file', 'declared_at',
      'declared_reference', 'failure_reason', 'fee_amount', 'discount_amount', 'amount_gross',
      'provider_reference', 'payment_method_id',
    ]) {
      await q.query(`ALTER TABLE subscription_payments DROP COLUMN IF EXISTS \`${column}\``);
    }
    await q.query(`UPDATE subscription_payments SET status = 'pending' WHERE status IN ('awaiting_validation','cancelled')`);
    await q.query(`
      ALTER TABLE subscription_payments
      MODIFY COLUMN status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending'
    `);
    await q.query(`DROP TABLE IF EXISTS platform_payment_methods`);
  }
}
