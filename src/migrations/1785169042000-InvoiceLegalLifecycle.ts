import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supprime le faux état « impayée » : le retard est désormais une projection
 * de la date d'échéance et du solde. Ajoute les qualifications juridiques
 * nécessaires aux factures finales, avoirs et abandons de créance.
 */
export class InvoiceLegalLifecycle1785169042000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_status_legacy_audit (
        invoice_id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        legacy_status VARCHAR(32) NOT NULL,
        migrated_status VARCHAR(32) NOT NULL,
        migrated_at DATETIME(6) NOT NULL,
        PRIMARY KEY (invoice_id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      INSERT IGNORE INTO invoice_status_legacy_audit
        (invoice_id, tenant_id, legacy_status, migrated_status, migrated_at)
      SELECT
        f.id,
        f.tenant_id,
        '4',
        CASE
          WHEN COALESCE(p.paid, 0) >= f.montant_ttc THEN '3'
          WHEN COALESCE(p.paid, 0) > 0 THEN '2'
          ELSE '6'
        END,
        UTC_TIMESTAMP(6)
      FROM factures f
      LEFT JOIN (
        SELECT facture_id, tenant_id, SUM(montant) AS paid
        FROM paiements
        WHERE status = '1' AND deleted_at IS NULL
        GROUP BY facture_id, tenant_id
      ) p ON p.facture_id = f.id AND p.tenant_id = f.tenant_id
      WHERE f.status = '4'
    `);
    await queryRunner.query(`
      UPDATE factures f
      LEFT JOIN (
        SELECT facture_id, tenant_id, SUM(montant) AS paid
        FROM paiements
        WHERE status = '1' AND deleted_at IS NULL
        GROUP BY facture_id, tenant_id
      ) p ON p.facture_id = f.id AND p.tenant_id = f.tenant_id
      SET f.status = CASE
        WHEN COALESCE(p.paid, 0) >= f.montant_ttc THEN '3'
        WHEN COALESCE(p.paid, 0) > 0 THEN '2'
        ELSE '6'
      END
      WHERE f.status = '4'
    `);
    await queryRunner.query(`
      ALTER TABLE factures
      MODIFY COLUMN status ENUM('0','1','2','3','5','6')
        NOT NULL DEFAULT '0',
      ADD COLUMN nature ENUM('STANDARD','FINAL','CREDIT_NOTE')
        NOT NULL DEFAULT 'STANDARD' AFTER status,
      ADD COLUMN settlement_disposition
        ENUM('NONE','CREDITED','WAIVED','BAD_DEBT')
        NOT NULL DEFAULT 'NONE' AFTER nature,
      ADD COLUMN original_invoice_id CHAR(36) NULL
        AFTER settlement_disposition,
      ADD COLUMN disposition_reason TEXT NULL AFTER original_invoice_id,
      ADD COLUMN disposition_at DATETIME(6) NULL AFTER disposition_reason,
      ADD COLUMN disposition_by VARCHAR(64) NULL AFTER disposition_at,
      ADD KEY IDX_facture_tenant_nature (tenant_id, nature),
      ADD KEY IDX_facture_original_invoice (tenant_id, original_invoice_id),
      ADD CONSTRAINT FK_facture_original_invoice
        FOREIGN KEY (original_invoice_id) REFERENCES factures(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE factures
      DROP FOREIGN KEY FK_facture_original_invoice,
      DROP INDEX IDX_facture_original_invoice,
      DROP INDEX IDX_facture_tenant_nature,
      DROP COLUMN disposition_by,
      DROP COLUMN disposition_at,
      DROP COLUMN disposition_reason,
      DROP COLUMN original_invoice_id,
      DROP COLUMN settlement_disposition,
      DROP COLUMN nature,
      MODIFY COLUMN status ENUM('0','1','2','3','4','5','6')
        NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      UPDATE factures f
      INNER JOIN invoice_status_legacy_audit a ON a.invoice_id = f.id
      SET f.status = '4'
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_status_legacy_audit`);
  }
}
