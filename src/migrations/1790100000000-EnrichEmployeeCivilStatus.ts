import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enrichit la fiche collaborateur des informations d'état civil exigées à la
 * création (lieu de naissance, adresse personnelle, téléphone personnel,
 * statut social, nombre d'enfants) et ajoute deux fonctions au référentiel :
 * « Personnel de support » et « Apporteur d'affaire ».
 *
 * Les profils d'accès correspondants (`support`, `apporteur_affaire`) sont
 * créés automatiquement au démarrage par RoleSeeder — aucune insertion ici.
 */
export class EnrichEmployeeCivilStatus1790100000000
  implements MigrationInterface
{
  private static readonly POSITIONS_BEFORE =
    "'avocat','collaborateur','juriste','comptable','secretaire','assistant','stagiaire','huissier','administratif'";

  private static readonly POSITIONS_AFTER =
    "'avocat','collaborateur','juriste','comptable','secretaire','assistant','stagiaire','huissier','administratif','support','apporteur_affaire'";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employee MODIFY COLUMN position
      enum(${EnrichEmployeeCivilStatus1790100000000.POSITIONS_AFTER})
      NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE employee
        ADD COLUMN birth_place varchar(150) NULL AFTER birth_date,
        ADD COLUMN home_address text NULL AFTER birth_place,
        ADD COLUMN personal_phone varchar(20) NULL AFTER home_address,
        ADD COLUMN marital_status enum('celibataire','marie','divorce','veuf','union_libre') NULL AFTER personal_phone,
        ADD COLUMN children_count int NULL DEFAULT 0 AFTER marital_status
    `);

    // Reprise : à défaut de téléphone personnel connu, on part du
    // professionnel déjà saisi (l'utilisateur pourra le corriger).
    await queryRunner.query(`
      UPDATE employee
         SET personal_phone = professional_phone
       WHERE personal_phone IS NULL AND professional_phone IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employee
        DROP COLUMN children_count,
        DROP COLUMN marital_status,
        DROP COLUMN personal_phone,
        DROP COLUMN home_address,
        DROP COLUMN birth_place
    `);

    // Les fonctions retirées se replient sur « administratif », la plus proche
    // des deux en termes de périmètre.
    await queryRunner.query(
      "UPDATE employee SET position = 'administratif' WHERE position IN ('support','apporteur_affaire')",
    );
    await queryRunner.query(`
      ALTER TABLE employee MODIFY COLUMN position
      enum(${EnrichEmployeeCivilStatus1790100000000.POSITIONS_BEFORE})
      NOT NULL
    `);
  }
}
