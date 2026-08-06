import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

export class TenantAccountingReferenceUniqueness1785169026000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoDuplicates(
      queryRunner,
      'comptes_comptables',
      ['tenant_id', 'numero'],
      'numéros de comptes',
    );
    await this.assertNoDuplicates(
      queryRunner,
      'journaux_comptables',
      ['tenant_id', 'code'],
      'codes de journaux',
    );
    await this.assertNoDuplicates(
      queryRunner,
      'journaux_comptables',
      ['tenant_id', 'typeJournal'],
      'types de journaux',
    );
    await this.assertNoDuplicates(
      queryRunner,
      'exercices_comptables',
      ['tenant_id', 'annee'],
      'années d’exercice',
    );

    await this.dropGlobalUniqueIndex(
      queryRunner,
      'comptes_comptables',
      'numero',
    );
    await this.dropGlobalUniqueIndex(
      queryRunner,
      'journaux_comptables',
      'code',
    );
    await this.dropGlobalUniqueIndex(
      queryRunner,
      'journaux_comptables',
      'typeJournal',
    );
    await this.dropGlobalUniqueIndex(
      queryRunner,
      'exercices_comptables',
      'annee',
    );

    await this.createUniqueIndex(
      queryRunner,
      'comptes_comptables',
      'UQ_accounts_tenant_number',
      ['tenant_id', 'numero'],
    );
    await this.createUniqueIndex(
      queryRunner,
      'journaux_comptables',
      'UQ_journals_tenant_code',
      ['tenant_id', 'code'],
    );
    await this.createUniqueIndex(
      queryRunner,
      'journaux_comptables',
      'UQ_journals_tenant_type',
      ['tenant_id', 'typeJournal'],
    );
    await this.createUniqueIndex(
      queryRunner,
      'exercices_comptables',
      'UQ_exercises_tenant_year',
      ['tenant_id', 'annee'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [tableName, indexName] of [
      ['exercices_comptables', 'UQ_exercises_tenant_year'],
      ['journaux_comptables', 'UQ_journals_tenant_type'],
      ['journaux_comptables', 'UQ_journals_tenant_code'],
      ['comptes_comptables', 'UQ_accounts_tenant_number'],
    ] as const) {
      const table = await queryRunner.getTable(tableName);
      const index = table?.indices.find(
        (candidate) => candidate.name === indexName,
      );
      if (index) await queryRunner.dropIndex(tableName, index);
    }
  }

  private async assertNoDuplicates(
    queryRunner: QueryRunner,
    tableName: string,
    columnNames: string[],
    label: string,
  ): Promise<void> {
    const columns = columnNames.map((column) => `\`${column}\``).join(', ');
    const rows = await queryRunner.query(
      `SELECT ${columns}, COUNT(*) AS duplicate_count
       FROM \`${tableName}\`
       GROUP BY ${columns}
       HAVING COUNT(*) > 1
       LIMIT 1`,
    );
    if (rows.length > 0) {
      throw new Error(
        `Migration interrompue : des ${label} sont dupliqués dans un même cabinet`,
      );
    }
  }

  private async dropGlobalUniqueIndex(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const globalUnique = table.indices.find(
      (index) =>
        index.isUnique &&
        index.columnNames.length === 1 &&
        index.columnNames[0] === columnName,
    );
    if (globalUnique) {
      await queryRunner.dropIndex(tableName, globalUnique);
    }
  }

  private async createUniqueIndex(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columnNames: string[],
  ): Promise<void> {
    const table = (await queryRunner.getTable(tableName)) as Table | undefined;
    if (!table || table.indices.some((index) => index.name === indexName)) {
      return;
    }
    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: indexName,
        columnNames,
        isUnique: true,
      }),
    );
  }
}
