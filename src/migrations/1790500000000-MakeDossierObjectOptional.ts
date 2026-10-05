import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * L'objet du dossier (« nom de l'affaire ») devient facultatif.
 *
 * Le formulaire d'ouverture ne le saisit plus : il le déduit de
 * « Client c/ Adversaire » via `buildCaseName()`. Le backend a suivi en
 * rendant `object` optionnel dans `CreateDossierDto` et en retirant
 * l'exigence métier du handler d'écriture IA. Pour que cette absence soit
 * réellement acceptée jusqu'au bout de la chaîne, la colonne doit accepter
 * NULL — sinon un client tiers qui omet `object` se prendrait une erreur
 * SQL au lieu d'une validation claire.
 *
 * `object` est déjà NULL sur toutes les lignes existantes (NOT NULL empêchait
 * l'absence de valeur), l'ALTER est donc sans risque de perte de données.
 */
export class MakeDossierObjectOptional1790500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`dossiers\`
        MODIFY COLUMN \`object\` TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaure l'obligation : toute ligne sans intitulé doit être complétée
    // avant de repasser la colonne en NOT NULL.
    await queryRunner.query(`
      UPDATE \`dossiers\`
         SET \`object\` = 'Sans intitulé'
       WHERE \`object\` IS NULL OR TRIM(\`object\`) = ''
    `);
    await queryRunner.query(`
      ALTER TABLE \`dossiers\`
        MODIFY COLUMN \`object\` TEXT NOT NULL
    `);
  }
}
