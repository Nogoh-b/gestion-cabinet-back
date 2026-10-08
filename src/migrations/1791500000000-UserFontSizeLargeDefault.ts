import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Les nouvelles préférences utilisateur démarrent avec la taille de texte
 * « grande ». Les choix déjà enregistrés restent inchangés.
 */
export class UserFontSizeLargeDefault1791500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_settings
         MODIFY COLUMN user_font_size VARCHAR(5) NOT NULL DEFAULT 'lg'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_settings
         MODIFY COLUMN user_font_size VARCHAR(5) NOT NULL DEFAULT 'md'`,
    );
  }
}
