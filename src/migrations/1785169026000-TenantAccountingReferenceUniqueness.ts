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
    // Un référentiel comptable semé deux fois pour un même cabinet crée des
    // lignes strictement identiques : on les fusionne (références repointées
    // vers la plus ancienne) au lieu de bloquer. Les vrais conflits (même clé
    // mais contenu différent) restent signalés par assertNoDuplicates.
    await this.mergeExactDuplicates(
      queryRunner,
      'exercices_comptables',
      ['tenant_id', 'annee'],
      [{ table: 'ecritures_comptables', column: 'exercice_id', onUpdate: true }],
    );
    await this.mergeExactDuplicates(
      queryRunner,
      'journaux_comptables',
      ['tenant_id', 'code', 'typeJournal'],
      [{ table: 'ecritures_comptables', column: 'journal_id', onUpdate: true }],
    );
    await this.mergeExactDuplicates(
      queryRunner,
      'comptes_comptables',
      ['tenant_id', 'numero'],
      [{ table: 'lignes_ecriture_comptable', column: 'compte_id' }],
    );

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

  /**
   * Fusionne les lignes dupliquées sur `keyColumns` : la plus ancienne (MIN(id))
   * est conservée, les tables référençantes sont repointées, les autres sont
   * supprimées. `onUpdate` : la table référençante a un `updated_at ON UPDATE`
   * qu'il faut neutraliser pour ne pas réécrire l'historique.
   */
  private async mergeExactDuplicates(
    queryRunner: QueryRunner,
    tableName: string,
    keyColumns: string[],
    references: Array<{ table: string; column: string; onUpdate?: boolean }>,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(tableName))) return;
    const keys = keyColumns.map((column) => `\`${column}\``).join(', ');
    const sameKey = keyColumns
      .map((column) => `dup.\`${column}\` <=> keep.\`${column}\``)
      .join(' AND ');
    const keepers = `(SELECT ${keys}, MIN(id) AS keep_id
                      FROM \`${tableName}\` GROUP BY ${keys}) keep`;

    for (const ref of references) {
      if (!(await queryRunner.hasTable(ref.table))) continue;
      const touch = ref.onUpdate ? ', r.`updated_at` = r.`updated_at`' : '';
      await queryRunner.query(
        `UPDATE \`${ref.table}\` r
           JOIN \`${tableName}\` dup ON r.\`${ref.column}\` = dup.id
           JOIN ${keepers} ON ${sameKey}
            SET r.\`${ref.column}\` = keep.keep_id${touch}
          WHERE dup.id <> keep.keep_id`,
      );
    }
    await queryRunner.query(
      `DELETE dup FROM \`${tableName}\` dup
         JOIN ${keepers} ON ${sameKey}
        WHERE dup.id <> keep.keep_id`,
    );
  }

  private async assertNoDuplicates(
    queryRunner: QueryRunner,
    tableName: string,
    columnNames: string[],
    label: string,
  ): Promise<void> {
    const columns = columnNames.map((column) => `\`${column}\``).join(', ');
    const rows: Array<Record<string, unknown> & { duplicate_count: number }> =
      await queryRunner.query(
        `SELECT ${columns}, COUNT(*) AS duplicate_count,
                MIN(id) AS first_id, MAX(id) AS last_id
         FROM \`${tableName}\`
         GROUP BY ${columns}
         HAVING COUNT(*) > 1
         ORDER BY duplicate_count DESC, first_id
         LIMIT 10`,
      );
    if (rows.length > 0) {
      // Message exploitable : sans les clés fautives, l'opérateur doit
      // reconstruire la requête de diagnostic avant de pouvoir débloquer.
      const details = rows
        .map((row) => {
          const key = columnNames
            .map((column) => `${column}=${String(row[column])}`)
            .join(' ');
          return `${key} (${row.duplicate_count} lignes, ids ${row.first_id}…${row.last_id})`;
        })
        .join(' ; ');
      const more = rows.length === 10 ? ' (liste tronquée à 10 clés)' : '';
      throw new Error(
        `Migration interrompue : des ${label} sont dupliqués dans un même cabinet. ` +
          `Clés en doublon dans \`${tableName}\` : ${details}${more}. ` +
          `Dédoublonner puis rejouer la migration.`,
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
