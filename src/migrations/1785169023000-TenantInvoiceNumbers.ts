import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class TenantInvoiceNumbers1785169023000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('factures');
    for (const unique of table?.uniques ?? []) {
      if (
        unique.columnNames.length === 1 &&
        unique.columnNames[0] === 'numero'
      ) {
        await queryRunner.dropUniqueConstraint('factures', unique);
      }
    }
    for (const index of table?.indices ?? []) {
      if (
        index.isUnique &&
        index.columnNames.length === 1 &&
        index.columnNames[0] === 'numero'
      ) {
        await queryRunner.dropIndex('factures', index);
      }
    }
    const refreshed = await queryRunner.getTable('factures');
    if (
      !refreshed?.indices.some(
        (index) => index.name === 'UQ_factures_tenant_numero',
      )
    ) {
      await queryRunner.createIndex(
        'factures',
        new TableIndex({
          name: 'UQ_factures_tenant_numero',
          columnNames: ['tenant_id', 'numero'],
          isUnique: true,
        }),
      );
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_number_sequences (
        tenant_id INT NOT NULL,
        scope_key CHAR(64) NOT NULL,
        next_value BIGINT NOT NULL DEFAULT 1,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tenant_id, scope_key)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_number_sequences`);
    const table = await queryRunner.getTable('factures');
    const index = table?.indices.find(
      (item) => item.name === 'UQ_factures_tenant_numero',
    );
    if (index) await queryRunner.dropIndex('factures', index);
  }
}
