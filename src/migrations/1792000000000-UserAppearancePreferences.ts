import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Apparence personnelle par utilisateur.
 *
 * - `cabinets.theme_name` passe d'un ENUM à 6 valeurs à un VARCHAR : les 12
 *   thèmes proposés par le front (minuit, émeraude…) deviennent enregistrables.
 *   Les colonnes thème/polices du cabinet deviennent les défauts appliqués
 *   aux NOUVEAUX membres ; on y ajoute la taille de texte et le style de sidebar.
 * - `user_settings` reçoit thème, polices et style de sidebar. Les lignes
 *   existantes reprennent les valeurs actuelles de leur cabinet et une sidebar
 *   claire : l'apparence des utilisateurs existants ne change pas.
 */
export class UserAppearancePreferences1792000000000
  implements MigrationInterface
{
  name = 'UserAppearancePreferences1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN theme_name VARCHAR(20) NOT NULL DEFAULT 'midnight'`,
    );
    // Un thème hors enum (minuit, émeraude…) était stocké en chaîne vide par
    // MariaDB ; le front l'affichait alors en « ocean ». On fige ce rendu.
    await queryRunner.query(
      `UPDATE cabinets SET theme_name = 'ocean' WHERE theme_name = ''`,
    );

    // Les cabinets existants gardent la sidebar claire actuelle ; les
    // nouveaux reçoivent les défauts plateforme (posés explicitement à la
    // création, le DEFAULT SQL n'est qu'un filet de sécurité).
    await queryRunner.query(
      `ALTER TABLE cabinets
         ADD COLUMN default_font_size VARCHAR(5) NOT NULL DEFAULT 'lg',
         ADD COLUMN default_sidebar_style VARCHAR(10) NOT NULL DEFAULT 'light'`,
    );
    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN default_sidebar_style VARCHAR(10) NOT NULL DEFAULT 'tinted'`,
    );

    await queryRunner.query(
      `ALTER TABLE user_settings
         ADD COLUMN user_theme_name VARCHAR(20) NULL,
         ADD COLUMN user_font_ui VARCHAR(50) NULL,
         ADD COLUMN user_font_heading VARCHAR(50) NULL,
         ADD COLUMN user_font_mono VARCHAR(50) NULL,
         ADD COLUMN user_sidebar_style VARCHAR(10) NULL`,
    );

    await queryRunner.query(
      `UPDATE user_settings us
         JOIN cabinets c ON c.id = us.tenant_id
          SET us.user_theme_name    = c.theme_name,
              us.user_font_ui       = c.font_ui,
              us.user_font_heading  = c.font_heading,
              us.user_font_mono     = c.font_mono,
              us.user_sidebar_style = 'light'
        WHERE us.user_theme_name IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_settings
         DROP COLUMN user_theme_name,
         DROP COLUMN user_font_ui,
         DROP COLUMN user_font_heading,
         DROP COLUMN user_font_mono,
         DROP COLUMN user_sidebar_style`,
    );
    await queryRunner.query(
      `ALTER TABLE cabinets
         DROP COLUMN default_font_size,
         DROP COLUMN default_sidebar_style`,
    );
    await queryRunner.query(
      `UPDATE cabinets SET theme_name = 'ocean'
        WHERE theme_name NOT IN ('ocean','silver','yellow','forest','sunset','rose')`,
    );
    await queryRunner.query(
      `ALTER TABLE cabinets
         MODIFY COLUMN theme_name ENUM('ocean','silver','yellow','forest','sunset','rose')
         NOT NULL DEFAULT 'ocean'`,
    );
  }
}
