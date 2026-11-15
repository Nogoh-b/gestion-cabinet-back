import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `guide_overrides` — modifications de la prise en main faites depuis la
 * console plateforme (visites, bulles, astuces, fiches d'aide, nouveautés).
 * Le contenu écrit dans le front reste la base : une ligne ne porte que les
 * champs modifiés. Table globale (pas de tenant_id), lue en SQL brut.
 *
 * - `data`  : version publiée (NULL tant que rien n'a été publié) ;
 * - `draft` : brouillon en cours (NULL si aucun changement en attente).
 */
export class GuideOverrides1795300000000 implements MigrationInterface {
  name = 'GuideOverrides1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS guide_overrides (
        id INT NOT NULL AUTO_INCREMENT,
        kind ENUM('tour','step','tip','help','release') NOT NULL,
        target VARCHAR(160) NOT NULL,
        data JSON NULL,
        draft JSON NULL,
        published_at DATETIME NULL,
        updated_by_admin_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_guide_overrides_kind_target (kind, target)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS guide_overrides`);
  }
}
