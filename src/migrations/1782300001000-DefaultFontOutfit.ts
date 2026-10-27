import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Change la police par défaut du cabinet : Inter → Outfit.
 *
 * - Change le DEFAULT de colonne (nouveaux cabinets créés sans valeur explicite).
 * - Bascule vers 'outfit' les cabinets dont font_ui / font_heading valent encore
 *   'inter' (= jamais personnalisés via le sélecteur de police) — ceux qui ont
 *   choisi une autre police explicitement ne sont PAS touchés.
 *
 * Idempotent : la base de dev tourne en `synchronize:true` et a pu déjà
 * appliquer le nouveau DEFAULT de colonne.
 */
export class DefaultFontOutfit1782300001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN font_ui VARCHAR(50) NOT NULL DEFAULT 'outfit'`,
    );
    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN font_heading VARCHAR(50) NOT NULL DEFAULT 'outfit'`,
    );

    await queryRunner.query(
      `UPDATE cabinets SET font_ui = 'outfit' WHERE font_ui = 'inter'`,
    );
    await queryRunner.query(
      `UPDATE cabinets SET font_heading = 'outfit' WHERE font_heading = 'inter'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE cabinets SET font_ui = 'inter' WHERE font_ui = 'outfit'`,
    );
    await queryRunner.query(
      `UPDATE cabinets SET font_heading = 'inter' WHERE font_heading = 'outfit'`,
    );

    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN font_ui VARCHAR(50) NOT NULL DEFAULT 'inter'`,
    );
    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN font_heading VARCHAR(50) NOT NULL DEFAULT 'inter'`,
    );
  }
}
