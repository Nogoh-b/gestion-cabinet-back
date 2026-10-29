import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enregistrement audio des audiences : une ligne par segment téléversé
 * (fichier webm/opus sous `uploads/audiences/<tenant>/<audience>/`). La
 * taille des fichiers compte dans l'espace de stockage du cabinet.
 */
export class AudienceRecordings1794400000000 implements MigrationInterface {
  name = 'AudienceRecordings1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('audience_recordings')) return;
    await queryRunner.query(`
      CREATE TABLE \`audience_recordings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`tenant_id\` int NOT NULL DEFAULT 1,
        \`audience_id\` int NOT NULL,
        \`session_id\` varchar(64) NOT NULL,
        \`segment_index\` int NOT NULL DEFAULT 0,
        \`file_path\` varchar(500) NOT NULL,
        \`file_size\` bigint NOT NULL DEFAULT 0,
        \`duration_seconds\` int NULL,
        \`mime\` varchar(100) NOT NULL DEFAULT 'audio/webm',
        \`transcript\` mediumtext NULL,
        \`transcript_status\` enum('pending','processing','done','empty','failed') NULL,
        \`created_by\` int NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_audience_recordings_tenant\` (\`tenant_id\`),
        INDEX \`IDX_audience_recordings_audience\` (\`audience_id\`),
        INDEX \`IDX_audience_recordings_session\` (\`audience_id\`, \`session_id\`, \`segment_index\`),
        CONSTRAINT \`FK_audience_recordings_audience\` FOREIGN KEY (\`audience_id\`)
          REFERENCES \`audiences\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('audience_recordings')) {
      await queryRunner.dropTable('audience_recordings');
    }
  }
}
