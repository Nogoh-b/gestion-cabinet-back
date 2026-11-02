import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class SecureSupplierInvoiceLifecycle1785169027000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions = [
      [
        'approved_by_id',
        'ADD COLUMN approved_by_id INT NULL',
      ],
      [
        'approved_at',
        'ADD COLUMN approved_at DATETIME(6) NULL',
      ],
      ['paid_by_id', 'ADD COLUMN paid_by_id INT NULL'],
      [
        'payment_reference',
        'ADD COLUMN payment_reference VARCHAR(255) NULL',
      ],
    ] as const;
    for (const [column, sql] of additions) {
      if (!(await queryRunner.hasColumn('supplier_invoice', column))) {
        await queryRunner.query(
          `ALTER TABLE supplier_invoice ${sql}`,
        );
      }
    }

    await queryRunner.query(
      `ALTER TABLE supplier_invoice
       MODIFY COLUMN amount_ht DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN amount_tva DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN amount_ttc DECIMAL(18,2) NOT NULL`,
    );

    const duplicates = await queryRunner.query(
      `SELECT tenant_id, supplier_id, invoice_number, COUNT(*) AS duplicate_count
       FROM supplier_invoice
       GROUP BY tenant_id, supplier_id, invoice_number
       HAVING COUNT(*) > 1
       LIMIT 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        'Migration interrompue : des factures fournisseur sont dupliquées pour un même fournisseur',
      );
    }
    const table = await queryRunner.getTable('supplier_invoice');
    if (
      table &&
      !table.indices.some(
        (index) =>
          index.name ===
          'UQ_supplier_invoice_tenant_supplier_number',
      )
    ) {
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: 'UQ_supplier_invoice_tenant_supplier_number',
          columnNames: ['tenant_id', 'supplier_id', 'invoice_number'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('supplier_invoice');
    const uniqueIndex = table?.indices.find(
      (index) =>
        index.name ===
        'UQ_supplier_invoice_tenant_supplier_number',
    );
    if (uniqueIndex) {
      await queryRunner.dropIndex('supplier_invoice', uniqueIndex);
    }
    for (const column of [
      'payment_reference',
      'paid_by_id',
      'approved_at',
      'approved_by_id',
    ]) {
      if (await queryRunner.hasColumn('supplier_invoice', column)) {
        await queryRunner.query(
          `ALTER TABLE supplier_invoice DROP COLUMN \`${column}\``,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE supplier_invoice
       MODIFY COLUMN amount_ht DECIMAL(10,2) NOT NULL,
       MODIFY COLUMN amount_tva DECIMAL(10,2) NOT NULL,
       MODIFY COLUMN amount_ttc DECIMAL(10,2) NOT NULL`,
    );
  }
}
