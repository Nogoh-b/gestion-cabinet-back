import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class SecureSupplierEvidence implements MigrationInterface {
  name = 'SecureSupplierEvidence1785169043000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS supplier_evidence_migration_issues (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id INT NULL,
        resource_type VARCHAR(40) NOT NULL,
        resource_id VARCHAR(64) NOT NULL,
        legacy_reference VARCHAR(500) NOT NULL,
        reason VARCHAR(120) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_supplier_evidence_issue_resource
          (tenant_id, resource_type, resource_id)
      ) ENGINE=InnoDB
    `);

    for (const table of ['supplier_invoice', 'expense_line']) {
      for (const column of [
        new TableColumn({
          name: 'attachment_original_name',
          type: 'varchar',
          length: '255',
          isNullable: true,
        }),
        new TableColumn({
          name: 'attachment_mime_type',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
        new TableColumn({
          name: 'attachment_size',
          type: 'bigint',
          isNullable: true,
        }),
        new TableColumn({
          name: 'attachment_sha256',
          type: 'char',
          length: '64',
          isNullable: true,
        }),
      ]) {
        if (!(await queryRunner.hasColumn(table, column.name))) {
          await queryRunner.addColumn(table, column);
        }
      }
      const resourceType =
        table === 'supplier_invoice' ? 'supplier_invoice' : 'expense_line';
      await queryRunner.query(
        `INSERT INTO supplier_evidence_migration_issues
          (tenant_id, resource_type, resource_id, legacy_reference, reason)
         SELECT tenant_id, ?, CAST(id AS CHAR), attachment_url,
                'LEGACY_PUBLIC_REFERENCE_REQUIRES_PRIVATE_IMPORT'
           FROM ${table}
          WHERE attachment_url IS NOT NULL
            AND attachment_url <> ''
            AND (attachment_url LIKE '%://%'
              OR attachment_url LIKE '/%'
              OR attachment_url LIKE '\\\\%')`,
        [resourceType],
      );
      await queryRunner.query(
        `UPDATE ${table}
            SET attachment_url = NULL
          WHERE attachment_url IS NOT NULL
            AND attachment_url <> ''
            AND (attachment_url LIKE '%://%'
              OR attachment_url LIKE '/%'
              OR attachment_url LIKE '\\\\%')`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['expense_line', 'supplier_invoice']) {
      for (const name of [
        'attachment_sha256',
        'attachment_size',
        'attachment_mime_type',
        'attachment_original_name',
      ]) {
        if (await queryRunner.hasColumn(table, name)) {
          await queryRunner.dropColumn(table, name);
        }
      }
    }
    await queryRunner.query(
      'DROP TABLE IF EXISTS supplier_evidence_migration_issues',
    );
  }
}
