import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la colonne `cabinets.ai_config` (JSON nullable) qui porte la
 * configuration IA par cabinet : fournisseur actif, clés API et modèles.
 *
 * Idempotente : la colonne n'est ajoutée que si elle est absente
 * (même garde-fou que `AddAiRequestLogMetrics`), afin qu'une ré-exécution
 * sur une base déjà à jour ne casse pas le démarrage.
 */
export class AddAiConfigToCabinet1790000000000 implements MigrationInterface {
  name = 'AddAiConfigToCabinet1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasColumn('cabinets', 'ai_config');
    if (!exists) {
      await queryRunner.query(
        `ALTER TABLE cabinets ADD COLUMN ai_config JSON NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasColumn('cabinets', 'ai_config');
    if (exists) {
      await queryRunner.query(`ALTER TABLE cabinets DROP COLUMN ai_config`);
    }
  }
}
