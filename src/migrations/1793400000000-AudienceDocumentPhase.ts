import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moment d'un document rattaché à une audience : `preparation` (avant,
 * valeur historique) ou `after` (après l'audience). La fiche audience
 * affiche deux cartes à partir de cette colonne de `audience_documents`.
 */
export class AudienceDocumentPhase1793400000000 implements MigrationInterface {
  name = 'AudienceDocumentPhase1793400000000';

  private async hasColumn(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'audience_documents'");
    if (!tables.length) return;
    if (!(await this.hasColumn(queryRunner, 'audience_documents', 'phase'))) {
      await queryRunner.query(
        "ALTER TABLE `audience_documents` ADD COLUMN `phase` VARCHAR(20) NOT NULL DEFAULT 'preparation'",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'audience_documents'");
    if (!tables.length) return;
    if (await this.hasColumn(queryRunner, 'audience_documents', 'phase')) {
      await queryRunner.query('ALTER TABLE `audience_documents` DROP COLUMN `phase`');
    }
  }
}
