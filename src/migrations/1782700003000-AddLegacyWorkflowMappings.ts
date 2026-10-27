import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegacyWorkflowMappings1782700003000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user MODIFY COLUMN role
      enum('admin','avocat','collaborateur','comptable','secretaire','client','stagiaire','huissier')
      NOT NULL DEFAULT 'avocat'
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legacy_workflow_mappings (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        match_pattern varchar(255) NOT NULL,
        match_mode varchar(20) NOT NULL DEFAULT 'CONTAINS',
        action_definition_code varchar(100) NOT NULL,
        priority int NOT NULL DEFAULT 0,
        is_active tinyint NOT NULL DEFAULT 1,
        lock_version int NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at datetime(6) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_legacy_workflow_mapping_pattern (tenant_id, match_mode, match_pattern),
        KEY IDX_legacy_workflow_mapping_active (tenant_id, is_active, priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS legacy_workflow_mappings');
    await queryRunner.query(
      "UPDATE user SET role = 'avocat' WHERE role = 'collaborateur'",
    );
    await queryRunner.query(
      "UPDATE user SET role = 'secretaire' WHERE role = 'comptable'",
    );
    await queryRunner.query(`
      ALTER TABLE user MODIFY COLUMN role
      enum('admin','avocat','secretaire','client','stagiaire','huissier')
      NOT NULL DEFAULT 'avocat'
    `);
  }
}
