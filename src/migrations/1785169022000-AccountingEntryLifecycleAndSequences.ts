import {
  MigrationInterface,
  QueryRunner,
  TableIndex,
} from 'typeorm';

export class AccountingEntryLifecycleAndSequences1785169022000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns: Record<string, string> = {
      status: "ENUM('DRAFT','POSTED','REVERSED') NOT NULL DEFAULT 'POSTED'",
      posted_at: 'DATETIME(6) NULL',
      reversed_at: 'DATETIME(6) NULL',
      reversal_of_id: 'INT NULL',
      reversal_reason: 'TEXT NULL',
      idempotency_key: 'VARCHAR(190) NULL',
    };
    for (const [name, definition] of Object.entries(columns)) {
      if (!(await queryRunner.hasColumn('ecritures_comptables', name))) {
        await queryRunner.query(
          `ALTER TABLE ecritures_comptables ADD COLUMN \`${name}\` ${definition}`,
        );
      }
    }
    await queryRunner.query(
      `UPDATE ecritures_comptables
       SET posted_at = COALESCE(posted_at, created_at),
           idempotency_key = COALESCE(
             idempotency_key,
             CONCAT('legacy:', id)
           )
       WHERE status = 'POSTED' OR idempotency_key IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ecritures_comptables
       MODIFY COLUMN idempotency_key VARCHAR(190) NOT NULL`,
    );

    const table = await queryRunner.getTable('ecritures_comptables');
    for (const unique of table?.uniques ?? []) {
      if (
        unique.columnNames.length === 1 &&
        unique.columnNames[0] === 'numero'
      ) {
        await queryRunner.dropUniqueConstraint(
          'ecritures_comptables',
          unique,
        );
      }
    }
    for (const index of table?.indices ?? []) {
      if (
        index.isUnique &&
        index.columnNames.length === 1 &&
        index.columnNames[0] === 'numero'
      ) {
        await queryRunner.dropIndex('ecritures_comptables', index);
      }
    }
    const refreshed = await queryRunner.getTable('ecritures_comptables');
    if (
      !refreshed?.indices.some(
        (index) => index.name === 'UQ_ecritures_tenant_numero',
      )
    ) {
      await queryRunner.createIndex(
        'ecritures_comptables',
        new TableIndex({
          name: 'UQ_ecritures_tenant_numero',
          columnNames: ['tenant_id', 'numero'],
          isUnique: true,
        }),
      );
    }
    if (
      !refreshed?.indices.some(
        (index) => index.name === 'UQ_ecritures_tenant_idempotency',
      )
    ) {
      await queryRunner.createIndex(
        'ecritures_comptables',
        new TableIndex({
          name: 'UQ_ecritures_tenant_idempotency',
          columnNames: ['tenant_id', 'idempotency_key'],
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS accounting_number_sequences (
        tenant_id INT NOT NULL,
        journal_code VARCHAR(20) NOT NULL,
        fiscal_year INT NOT NULL,
        next_value BIGINT NOT NULL DEFAULT 1,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tenant_id, journal_code, fiscal_year)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS accounting_number_sequences`);
    const table = await queryRunner.getTable('ecritures_comptables');
    for (const name of [
      'UQ_ecritures_tenant_idempotency',
      'UQ_ecritures_tenant_numero',
    ]) {
      const index = table?.indices.find((item) => item.name === name);
      if (index) {
        await queryRunner.dropIndex('ecritures_comptables', index);
      }
    }
    for (const name of [
      'idempotency_key',
      'reversal_reason',
      'reversal_of_id',
      'reversed_at',
      'posted_at',
      'status',
    ]) {
      if (await queryRunner.hasColumn('ecritures_comptables', name)) {
        await queryRunner.query(
          `ALTER TABLE ecritures_comptables DROP COLUMN \`${name}\``,
        );
      }
    }
  }
}
