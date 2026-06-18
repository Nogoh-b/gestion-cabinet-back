import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convertit le stockage du logo cabinet : `logo_url` LONGTEXT (data-URI base64)
 * → `logo` LONGBLOB (binaire) + `logo_mime` VARCHAR.
 *
 * Le format de transport côté API reste un data-URI (`logo_url`), reconstruit
 * à la volée. Seul le stockage en base devient binaire (plus léger, ~33% de
 * moins qu'en base64).
 *
 * Idempotent (gardes `hasColumn`) car la base de dev tourne en `synchronize:true`.
 */
export class CabinetLogoToBlob1779300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Colonnes binaires (si absentes)
    if (!(await queryRunner.hasColumn('cabinets', 'logo'))) {
      await queryRunner.query(`ALTER TABLE cabinets ADD COLUMN logo LONGBLOB NULL`);
    }
    if (!(await queryRunner.hasColumn('cabinets', 'logo_mime'))) {
      await queryRunner.query(`ALTER TABLE cabinets ADD COLUMN logo_mime VARCHAR(100) NULL`);
    }

    // 2. Migration des données : décode les data-URI base64 existants en blob.
    //    (Les logos stockés sous forme d'URL http ne sont pas convertibles en
    //     blob et sont donc abandonnés — cas rare.)
    if (await queryRunner.hasColumn('cabinets', 'logo_url')) {
      await queryRunner.query(`
        UPDATE cabinets
        SET
          logo_mime = SUBSTRING_INDEX(SUBSTRING_INDEX(logo_url, ';', 1), ':', -1),
          logo      = FROM_BASE64(SUBSTRING(logo_url, LOCATE(';base64,', logo_url) + 8))
        WHERE logo_url LIKE 'data:%;base64,%'
      `);

      // 3. Suppression de l'ancienne colonne texte.
      await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN logo_url`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Recrée la colonne texte (si absente).
    if (!(await queryRunner.hasColumn('cabinets', 'logo_url'))) {
      await queryRunner.query(`ALTER TABLE cabinets ADD COLUMN logo_url LONGTEXT NULL`);
    }

    // 2. Reconstruit le data-URI à partir du blob.
    if (await queryRunner.hasColumn('cabinets', 'logo')) {
      await queryRunner.query(`
        UPDATE cabinets
        SET logo_url = CONCAT('data:', COALESCE(logo_mime, 'image/png'), ';base64,', TO_BASE64(logo))
        WHERE logo IS NOT NULL
      `);
    }

    // 3. Supprime les colonnes binaires.
    if (await queryRunner.hasColumn('cabinets', 'logo')) {
      await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN logo`);
    }
    if (await queryRunner.hasColumn('cabinets', 'logo_mime')) {
      await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN logo_mime`);
    }
  }
}
