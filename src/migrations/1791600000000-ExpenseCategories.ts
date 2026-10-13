import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Catégories de dépenses gérables par le cabinet.
 * - Nouvelle table `expense_category` (seed des 7 valeurs historiques par cabinet).
 * - `expense_line.description` devient facultative.
 * - `expense_line.category` passe d'enum figé à code libre (varchar 80).
 */
export class ExpenseCategories1791600000000 implements MigrationInterface {
  name = 'ExpenseCategories1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('expense_category');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'expense_category',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            { name: 'tenant_id', type: 'int', default: 1 },
            { name: 'code', type: 'varchar', length: '80' },
            { name: 'label', type: 'varchar', length: '120' },
            { name: 'is_active', type: 'tinyint', default: 1 },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'deleted_at',
              type: 'timestamp',
              isNullable: true,
              default: null,
            },
          ],
        }),
        true,
      );
      await queryRunner.createIndex(
        'expense_category',
        new TableIndex({
          name: 'UQ_expense_category_tenant_code',
          columnNames: ['tenant_id', 'code'],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        'expense_category',
        new TableIndex({
          name: 'IDX_expense_category_tenant',
          columnNames: ['tenant_id'],
        }),
      );
    }

    // Seed des catégories historiques pour chaque cabinet existant.
    // Les tables sources sont testées avant lecture (schéma partiel possible).
    const tenantIdSet = new Set<number>();
    const collect = async (table: string, column = 'tenant_id') => {
      if (!(await queryRunner.hasTable(table))) return;
      if (!(await queryRunner.hasColumn(table, column))) return;
      const found = (await queryRunner.query(
        `SELECT DISTINCT \`${column}\` AS tenant_id FROM \`${table}\``,
      )) as Array<{ tenant_id: number | string | null }>;
      for (const row of found) {
        const id = Number(row.tenant_id);
        if (Number.isInteger(id) && id > 0) tenantIdSet.add(id);
      }
    };
    await collect('expense_line');
    await collect('supplier');
    await collect('cabinets', 'id');
    const seed: Array<[string, string]> = [
      ['transport', 'Transport'],
      ['accommodation', 'Hébergement'],
      ['meal', 'Repas'],
      ['bailiff', 'Huissier'],
      ['court_fees', 'Frais de justice'],
      ['office_supplies', 'Fournitures de bureau'],
      ['other', 'Autre'],
    ];
    const tenantIds = [...tenantIdSet];
    if (tenantIds.length === 0) tenantIds.push(1);
    for (const tenantId of tenantIds) {
      for (const [code, label] of seed) {
        await queryRunner.query(
          `INSERT IGNORE INTO expense_category (tenant_id, code, label, is_active) VALUES (?, ?, ?, 1)`,
          [tenantId, code, label],
        );
      }
    }

    // Description facultative + catégorie en code libre.
    await queryRunner.query(
      `ALTER TABLE expense_line MODIFY COLUMN description VARCHAR(500) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE expense_line MODIFY COLUMN category VARCHAR(80) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE expense_line MODIFY COLUMN category ENUM('transport','accommodation','meal','bailiff','court_fees','office_supplies','other') NOT NULL`,
    );
    await queryRunner.dropTable('expense_category', true);
  }
}
