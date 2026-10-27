import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute le libellé de facture (`factures.libelle`, nullable) utilisé pour
 * identifier la facture dans les affichages/listings/PDF.
 *
 * Règle métier : à la création comme à la modification, un libellé vide ou
 * absent reprend automatiquement le numéro de la facture (backfill inclus).
 * Idempotent : ne crée la colonne et ne remplit que si nécessaire.
 */
export class FactureLibelle1791800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn: Array<unknown> = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'factures'
          AND COLUMN_NAME = 'libelle' LIMIT 1`,
    );
    if (hasColumn.length === 0) {
      await queryRunner.query(
        `ALTER TABLE factures ADD COLUMN libelle varchar(255) NULL AFTER numero`,
      );
    }
    // Backfill : les factures existantes sans libellé reprennent leur numéro.
    await queryRunner.query(
      `UPDATE factures
          SET libelle = numero
        WHERE (libelle IS NULL OR libelle = '')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn: Array<unknown> = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'factures'
          AND COLUMN_NAME = 'libelle' LIMIT 1`,
    );
    if (hasColumn.length > 0) {
      await queryRunner.query(`ALTER TABLE factures DROP COLUMN libelle`);
    }
  }
}
