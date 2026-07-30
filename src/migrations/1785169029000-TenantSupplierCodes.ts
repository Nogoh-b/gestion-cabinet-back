import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class TenantSupplierCodes1785169029000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(
      `SELECT tenant_id, supplier_code, COUNT(*) AS duplicate_count
       FROM supplier
       GROUP BY tenant_id, supplier_code
       HAVING COUNT(*) > 1
       LIMIT 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        'Migration interrompue : des codes fournisseur sont dupliqués dans un même cabinet',
      );
    }
    let table = await queryRunner.getTable('supplier');
    if (!table) return;
    for (const index of table.indices.filter(
      (candidate) =>
        candidate.isUnique &&
        candidate.columnNames.length === 1 &&
        candidate.columnNames[0] === 'supplier_code',
    )) {
      await queryRunner.dropIndex(table, index);
    }
    table = await queryRunner.getTable('supplier');
    if (!table) return;
    for (const unique of table.uniques.filter(
      (candidate) =>
        candidate.columnNames.length === 1 &&
        candidate.columnNames[0] === 'supplier_code',
    )) {
      await queryRunner.dropUniqueConstraint(table, unique);
    }
    table = await queryRunner.getTable('supplier');
    if (
      table &&
      !table.indices.some(
        (index) => index.name === 'UQ_suppliers_tenant_code',
      )
    ) {
      await queryRunner.createIndex(
        table,
        new TableIndex({
          name: 'UQ_suppliers_tenant_code',
          columnNames: ['tenant_id', 'supplier_code'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('supplier');
    const index = table?.indices.find(
      (candidate) => candidate.name === 'UQ_suppliers_tenant_code',
    );
    if (index) await queryRunner.dropIndex('supplier', index);
  }
}
