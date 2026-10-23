import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Éditeur Word des documents et des modèles :
 * - `pdf_templates.layout_options` : taille et interligne du texte, marges,
 *   numéros de page d'un modèle (JSON, null = mise en page par défaut) ;
 * - `cabinets.custom_dictionary` : mots ajoutés au correcteur d'orthographe
 *   par les membres du cabinet (JSON, liste de mots).
 */
export class EditorLayoutAndDictionary1793200000000 implements MigrationInterface {
  name = 'EditorLayoutAndDictionary1793200000000';

  private async hasColumn(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner, 'pdf_templates', 'layout_options'))) {
      await queryRunner.query('ALTER TABLE `pdf_templates` ADD COLUMN `layout_options` JSON NULL AFTER `footer_block_id`');
    }
    if (!(await this.hasColumn(queryRunner, 'cabinets', 'custom_dictionary'))) {
      await queryRunner.query('ALTER TABLE `cabinets` ADD COLUMN `custom_dictionary` JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, 'cabinets', 'custom_dictionary')) {
      await queryRunner.query('ALTER TABLE `cabinets` DROP COLUMN `custom_dictionary`');
    }
    if (await this.hasColumn(queryRunner, 'pdf_templates', 'layout_options')) {
      await queryRunner.query('ALTER TABLE `pdf_templates` DROP COLUMN `layout_options`');
    }
  }
}
