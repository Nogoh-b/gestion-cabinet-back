import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class SecureReferralCommissionLifecycle1785169033000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions = [
      ['calculated_by_id', 'ADD COLUMN calculated_by_id INT NULL'],
      ['approved_by_id', 'ADD COLUMN approved_by_id INT NULL'],
      ['approved_at', 'ADD COLUMN approved_at DATETIME(6) NULL'],
      ['paid_by_id', 'ADD COLUMN paid_by_id INT NULL'],
      [
        'payment_method',
        `ADD COLUMN payment_method
         ENUM('bank_transfer','cash','mobile_money','check','other')
         NULL`,
      ],
      ['cancelled_by_id', 'ADD COLUMN cancelled_by_id INT NULL'],
      ['cancelled_at', 'ADD COLUMN cancelled_at DATETIME(6) NULL'],
      [
        'cancellation_reason',
        'ADD COLUMN cancellation_reason TEXT NULL',
      ],
    ] as const;
    for (const [column, definition] of additions) {
      if (
        !(await queryRunner.hasColumn(
          'referral_commission',
          column,
        ))
      ) {
        await queryRunner.query(
          `ALTER TABLE referral_commission ${definition}`,
        );
      }
    }

    await queryRunner.query(
      `ALTER TABLE referral_commission
       MODIFY COLUMN amount DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN payment_date DATETIME(6) NULL,
       MODIFY COLUMN payment_reference VARCHAR(255) NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS referral_commission_migration_issues (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         tenant_id INT NOT NULL,
         commission_id INT NOT NULL,
         issue_type VARCHAR(80) NOT NULL,
         original_facture_id VARCHAR(36) NULL,
         original_paiement_id VARCHAR(36) NULL,
         details JSON NULL,
         created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
         PRIMARY KEY (id),
         INDEX IDX_referral_commission_issue_tenant (tenant_id),
         INDEX IDX_referral_commission_issue_commission (commission_id)
       ) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TEMPORARY TABLE tmp_referral_duplicate_invoice AS
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY tenant_id, dossier_referral_id, facture_id
                ORDER BY
                  CASE status
                    WHEN 'paid' THEN 1
                    WHEN 'approved' THEN 2
                    WHEN 'calculated' THEN 3
                    ELSE 4
                  END,
                  id
              ) AS duplicate_rank
       FROM referral_commission
       WHERE facture_id IS NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO referral_commission_migration_issues
         (tenant_id, commission_id, issue_type,
          original_facture_id, original_paiement_id, details)
       SELECT c.tenant_id, c.id, 'DUPLICATE_INVOICE_SOURCE',
              c.facture_id, c.paiement_id,
              JSON_OBJECT(
                'status', c.status,
                'dossier_referral_id', c.dossier_referral_id,
                'amount', c.amount
              )
       FROM referral_commission c
       INNER JOIN tmp_referral_duplicate_invoice d
         ON d.id = c.id
       WHERE d.duplicate_rank > 1`,
    );
    await queryRunner.query(
      `UPDATE referral_commission c
       INNER JOIN tmp_referral_duplicate_invoice d
         ON d.id = c.id
       SET c.facture_id = NULL
       WHERE d.duplicate_rank > 1`,
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE tmp_referral_duplicate_invoice',
    );

    await queryRunner.query(
      `CREATE TEMPORARY TABLE tmp_referral_duplicate_payment AS
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY tenant_id, paiement_id
                ORDER BY
                  CASE status
                    WHEN 'paid' THEN 1
                    WHEN 'approved' THEN 2
                    WHEN 'calculated' THEN 3
                    ELSE 4
                  END,
                  id
              ) AS duplicate_rank
       FROM referral_commission
       WHERE paiement_id IS NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO referral_commission_migration_issues
         (tenant_id, commission_id, issue_type,
          original_facture_id, original_paiement_id, details)
       SELECT c.tenant_id, c.id, 'DUPLICATE_PAYMENT_SOURCE',
              c.facture_id, c.paiement_id,
              JSON_OBJECT(
                'status', c.status,
                'dossier_referral_id', c.dossier_referral_id,
                'amount', c.amount
              )
       FROM referral_commission c
       INNER JOIN tmp_referral_duplicate_payment d
         ON d.id = c.id
       WHERE d.duplicate_rank > 1`,
    );
    await queryRunner.query(
      `UPDATE referral_commission c
       INNER JOIN tmp_referral_duplicate_payment d
         ON d.id = c.id
       SET c.paiement_id = NULL
       WHERE d.duplicate_rank > 1`,
    );
    await queryRunner.query(
      'DROP TEMPORARY TABLE tmp_referral_duplicate_payment',
    );

    const table = await queryRunner.getTable('referral_commission');
    if (
      table &&
      !table.indices.some(
        (index) =>
          index.name ===
          'UQ_referral_commission_tenant_facture',
      )
    ) {
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: 'UQ_referral_commission_tenant_facture',
          columnNames: [
            'tenant_id',
            'dossier_referral_id',
            'facture_id',
          ],
          isUnique: true,
        }),
      );
    }
    const refreshed = await queryRunner.getTable(
      'referral_commission',
    );
    if (
      refreshed &&
      !refreshed.indices.some(
        (index) =>
          index.name ===
          'UQ_referral_commission_tenant_paiement',
      )
    ) {
      await queryRunner.createIndex(
        refreshed,
        new TableIndex({
          name: 'UQ_referral_commission_tenant_paiement',
          columnNames: ['tenant_id', 'paiement_id'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('referral_commission');
    for (const name of [
      'UQ_referral_commission_tenant_paiement',
      'UQ_referral_commission_tenant_facture',
    ]) {
      const index = table?.indices.find(
        (candidate) => candidate.name === name,
      );
      if (index) {
        await queryRunner.dropIndex('referral_commission', index);
      }
    }
    for (const column of [
      'cancellation_reason',
      'cancelled_at',
      'cancelled_by_id',
      'payment_method',
      'paid_by_id',
      'approved_at',
      'approved_by_id',
      'calculated_by_id',
    ]) {
      if (
        await queryRunner.hasColumn(
          'referral_commission',
          column,
        )
      ) {
        await queryRunner.query(
          `ALTER TABLE referral_commission DROP COLUMN \`${column}\``,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE referral_commission
       MODIFY COLUMN amount DECIMAL(12,2) NOT NULL,
       MODIFY COLUMN payment_date DATE NULL`,
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS referral_commission_migration_issues',
    );
  }
}
