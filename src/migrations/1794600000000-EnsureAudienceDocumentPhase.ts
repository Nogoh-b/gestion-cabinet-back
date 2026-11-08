import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Filet de sécurité de 1793400000000 : `audience_documents.phase` peut manquer
 * alors que la migration est marquée comme jouée (la colonne n'est pas portée
 * par l'entité de jointure et un `synchronize` la retire). Sans elle, toute
 * fiche audience tombe sur « Unknown column 'link.phase' ».
 */
export class EnsureAudienceDocumentPhase1794600000000 implements MigrationInterface {
  name = 'EnsureAudienceDocumentPhase1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'audience_documents'");
    if (!tables.length) return;
    const columns = await queryRunner.query("SHOW COLUMNS FROM `audience_documents` LIKE 'phase'");
    if (columns.length) return;
    await queryRunner.query(
      "ALTER TABLE `audience_documents` ADD COLUMN `phase` VARCHAR(20) NOT NULL DEFAULT 'preparation'",
    );
  }

  public async down(): Promise<void> {
    // Colonne gérée par 1793400000000 : rien à retirer ici.
  }
}
