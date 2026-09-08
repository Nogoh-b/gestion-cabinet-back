import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CompleteCaseWorkflowBilling1782700002000
  implements MigrationInterface
{
  name = 'CompleteCaseWorkflowBilling1782700002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn(
        'dossier_billing_rules',
        'action_definition_code',
      ))
    ) {
      await queryRunner.addColumn(
        'dossier_billing_rules',
        new TableColumn({
          name: 'action_definition_code',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
      );
    }
    if (
      !(await queryRunner.hasColumn('dossier_billing_rules', 'lock_version'))
    ) {
      await queryRunner.addColumn(
        'dossier_billing_rules',
        new TableColumn({
          name: 'lock_version',
          type: 'int',
          default: 1,
        }),
      );
    }
    const rulesTable = await queryRunner.getTable('dossier_billing_rules');
    if (
      rulesTable &&
      !rulesTable.indices.some(
        (index) => index.name === 'IDX_dossier_billing_rule_trigger',
      )
    ) {
      await queryRunner.createIndex(
        'dossier_billing_rules',
        new TableIndex({
          name: 'IDX_dossier_billing_rule_trigger',
          columnNames: [
            'tenant_id',
            'dossier_id',
            'trigger',
            'action_definition_code',
            'is_active',
          ],
        }),
      );
    }

    if (!(await queryRunner.hasColumn('factures', 'original_facture_id'))) {
      await queryRunner.addColumn(
        'factures',
        new TableColumn({
          name: 'original_facture_id',
          type: 'varchar',
          length: '36',
          isNullable: true,
        }),
      );
    }
    const facturesTable = await queryRunner.getTable('factures');
    if (
      facturesTable &&
      !facturesTable.indices.some(
        (index) => index.name === 'IDX_facture_original',
      )
    ) {
      await queryRunner.createIndex(
        'factures',
        new TableIndex({
          name: 'IDX_facture_original',
          columnNames: ['tenant_id', 'original_facture_id'],
        }),
      );
    }
    const refreshed = await queryRunner.getTable('factures');
    if (
      refreshed &&
      !refreshed.foreignKeys.some((key) => key.name === 'FK_facture_original')
    ) {
      await queryRunner.createForeignKey(
        'factures',
        new TableForeignKey({
          name: 'FK_facture_original',
          columnNames: ['original_facture_id'],
          referencedTableName: 'factures',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
        }),
      );
    }
    await queryRunner.query(
      "ALTER TABLE factures MODIFY COLUMN type enum('0','1','2','3','4') NOT NULL DEFAULT '0'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const facturesTable = await queryRunner.getTable('factures');
    const foreignKey = facturesTable?.foreignKeys.find(
      (key) => key.name === 'FK_facture_original',
    );
    if (foreignKey) await queryRunner.dropForeignKey('factures', foreignKey);
    if (
      facturesTable?.indices.some(
        (index) => index.name === 'IDX_facture_original',
      )
    ) {
      await queryRunner.dropIndex('factures', 'IDX_facture_original');
    }
    if (await queryRunner.hasColumn('factures', 'original_facture_id')) {
      await queryRunner.dropColumn('factures', 'original_facture_id');
    }
    await queryRunner.query(
      "ALTER TABLE factures MODIFY COLUMN type enum('0','1','2','3') NOT NULL DEFAULT '0'",
    );

    const rulesTable = await queryRunner.getTable('dossier_billing_rules');
    if (
      rulesTable?.indices.some(
        (index) => index.name === 'IDX_dossier_billing_rule_trigger',
      )
    ) {
      await queryRunner.dropIndex(
        'dossier_billing_rules',
        'IDX_dossier_billing_rule_trigger',
      );
    }
    if (await queryRunner.hasColumn('dossier_billing_rules', 'lock_version')) {
      await queryRunner.dropColumn('dossier_billing_rules', 'lock_version');
    }
    if (
      await queryRunner.hasColumn(
        'dossier_billing_rules',
        'action_definition_code',
      )
    ) {
      await queryRunner.dropColumn(
        'dossier_billing_rules',
        'action_definition_code',
      );
    }
  }
}
