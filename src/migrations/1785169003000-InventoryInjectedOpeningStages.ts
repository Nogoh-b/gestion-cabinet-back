import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inventorie sans suppression les étapes « Ouverture » susceptibles d'avoir
 * été injectées par l'ancien code de création d'instance.
 */
export class InventoryInjectedOpeningStages1785169003000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS procedure_repair_issues (
        id BIGINT NOT NULL AUTO_INCREMENT,
        issue_key VARCHAR(191) NOT NULL,
        issue_type VARCHAR(64) NOT NULL,
        tenant_id INT NULL,
        resource_type VARCHAR(64) NOT NULL,
        resource_id VARCHAR(64) NOT NULL,
        details JSON NULL,
        status ENUM('OPEN','REVIEWED','REPAIRED','IGNORED') NOT NULL DEFAULT 'OPEN',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY UQ_procedure_repair_issue_key (issue_key)
      ) ENGINE=InnoDB
    `);

    const stages: Array<{ TABLE_NAME: string }> = await queryRunner.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stages'`,
    );
    if (!stages.length) return;

    await queryRunner.query(`
      INSERT IGNORE INTO procedure_repair_issues
        (issue_key, issue_type, tenant_id, resource_type, resource_id, details)
      SELECT
        CONCAT('OPENING_STAGE:', s.id),
        'SUSPECT_OPENING_STAGE',
        s.tenant_id,
        'stage',
        s.id,
        JSON_OBJECT(
          'name', s.name,
          'template_id', s.templateId,
          'stage_order', s.\`order\`,
          'visit_count', (
            SELECT COUNT(*) FROM stage_visits sv WHERE sv.stageId = s.id
          ),
          'active_instance_count', (
            SELECT COUNT(*) FROM procedure_instances pi
            WHERE pi.currentStageId = s.id
          )
        )
      FROM stages s
      WHERE LOWER(TRIM(s.name)) IN ('ouverture', 'opening')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM procedure_repair_issues
      WHERE issue_type = 'SUSPECT_OPENING_STAGE'
    `);
  }
}
