import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la colonne `cabinets.billing_account_mapping` (JSON nullable) qui
 * porte la correspondance comptable par catégorie facturable, par exemple :
 * `{ "HONORARIUM": "706", "DISBURSEMENT": "471" }`.
 *
 * Idempotente : la colonne n'est ajoutée que si elle est absente.
 */
export class CabinetBillingAccountMapping1790700000000
  implements MigrationInterface
{
  name = 'CabinetBillingAccountMapping1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasColumn(
      'cabinets',
      'billing_account_mapping',
    );
    if (!exists) {
      await queryRunner.query(
        `ALTER TABLE cabinets ADD COLUMN billing_account_mapping JSON NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasColumn(
      'cabinets',
      'billing_account_mapping',
    );
    if (exists) {
      await queryRunner.query(
        `ALTER TABLE cabinets DROP COLUMN billing_account_mapping`,
      );
    }
  }
}
