import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddIsAdminToSavingsAccount1750098487972 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'savings_account',
      new TableColumn({
        name: 'is_admin',
        type: 'boolean',
        default: false,
        isNullable: true,
      }),
    );

    // Optionnel : Mettre à jour les valeurs existantes si nécessaire
    await queryRunner.query(
      `UPDATE savings_account SET is_admin = false WHERE is_admin IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('savings_account', 'is_admin');
  }

}
