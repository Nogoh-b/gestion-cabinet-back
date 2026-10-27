import { MigrationInterface, QueryRunner, TableForeignKey, TableIndex } from 'typeorm';

export class UnifiedExpenseWorkspace1790800000000
  implements MigrationInterface
{
  name = 'UnifiedExpenseWorkspace1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const additions: Array<[string, string]> = [
      ['dossier_id', 'INT NULL'],
      ['action_id', 'VARCHAR(36) NULL'],
      ['is_rebillable', 'TINYINT NOT NULL DEFAULT 0'],
      [
        'rebilling_type',
        "ENUM('EXPENSE','DISBURSEMENT') NOT NULL DEFAULT 'EXPENSE'",
      ],
      ['currency', "VARCHAR(10) NOT NULL DEFAULT 'XAF'"],
    ];
    for (const [column, definition] of additions) {
      if (!(await queryRunner.hasColumn('supplier_invoice', column))) {
        await queryRunner.query(
          `ALTER TABLE supplier_invoice ADD COLUMN ${column} ${definition}`,
        );
      }
    }

    const table = await queryRunner.getTable('supplier_invoice');
    if (!table) return;
    if (!table.indices.some((index) => index.name === 'IDX_supplier_invoice_dossier')) {
      await queryRunner.createIndex(
        'supplier_invoice',
        new TableIndex({
          name: 'IDX_supplier_invoice_dossier',
          columnNames: ['tenant_id', 'dossier_id'],
        }),
      );
    }
    if (!table.indices.some((index) => index.name === 'IDX_supplier_invoice_action')) {
      await queryRunner.createIndex(
        'supplier_invoice',
        new TableIndex({
          name: 'IDX_supplier_invoice_action',
          columnNames: ['tenant_id', 'action_id'],
        }),
      );
    }
    if (!table.foreignKeys.some((key) => key.name === 'FK_supplier_invoice_dossier')) {
      await queryRunner.createForeignKey(
        'supplier_invoice',
        new TableForeignKey({
          name: 'FK_supplier_invoice_dossier',
          columnNames: ['dossier_id'],
          referencedTableName: 'dossiers',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('supplier_invoice');
    const foreignKey = table?.foreignKeys.find(
      (key) => key.name === 'FK_supplier_invoice_dossier',
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('supplier_invoice', foreignKey);
    }
    for (const name of ['IDX_supplier_invoice_action', 'IDX_supplier_invoice_dossier']) {
      const index = (await queryRunner.getTable('supplier_invoice'))?.indices.find(
        (candidate) => candidate.name === name,
      );
      if (index) await queryRunner.dropIndex('supplier_invoice', index);
    }
    for (const column of [
      'currency',
      'rebilling_type',
      'is_rebillable',
      'action_id',
      'dossier_id',
    ]) {
      if (await queryRunner.hasColumn('supplier_invoice', column)) {
        await queryRunner.query(
          `ALTER TABLE supplier_invoice DROP COLUMN ${column}`,
        );
      }
    }
  }
}
