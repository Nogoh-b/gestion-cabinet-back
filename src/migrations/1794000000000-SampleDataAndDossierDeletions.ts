import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - `dossier_deletions` : corbeille des dossiers (restauration du dossier et
 *   des éléments supprimés avec lui).
 * - `sample_data_records` : lignes créées par le générateur de données de test
 *   de la console plateforme (le reset n'efface que celles-ci).
 */
export class SampleDataAndDossierDeletions1794000000000 implements MigrationInterface {
  name = 'SampleDataAndDossierDeletions1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`dossier_deletions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`tenant_id\` int NOT NULL,
        \`dossier_id\` int NOT NULL,
        \`dossier_number\` varchar(100) NOT NULL,
        \`include_categories\` json NOT NULL,
        \`items\` json NOT NULL,
        \`deleted_by\` varchar(190) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`restored_at\` datetime NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_dossier_deletions_tenant_created\` (\`tenant_id\`, \`created_at\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`sample_data_records\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`tenant_id\` int NOT NULL,
        \`batch_id\` varchar(36) NOT NULL,
        \`entity\` varchar(40) NOT NULL,
        \`entity_id\` varchar(64) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_sample_data_records_tenant_entity\` (\`tenant_id\`, \`entity\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `sample_data_records`');
    await queryRunner.query('DROP TABLE IF EXISTS `dossier_deletions`');
  }
}
