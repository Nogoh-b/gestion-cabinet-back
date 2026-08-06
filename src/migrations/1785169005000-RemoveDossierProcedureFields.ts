import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_COLUMNS = [
  'appeal_decision',
  'remand_jurisdiction',
  'first_instance_decision',
  'appeal_possibility',
  'appeal_deadline',
  'appeal_filed',
  'cassation_possibility',
  'current_decision_type',
  'cassation_deadline',
  'cassation_filed',
  'execution_date',
] as const;

/**
 * Retire du dossier les projections procédurales concurrentes. Leur contenu
 * reste disponible pour le rapprochement, sans être relu par le métier.
 */
export class RemoveDossierProcedureFields1785169005000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_procedure_legacy_audit (
        dossier_id INT NOT NULL,
        tenant_id INT NULL,
        legacy_data JSON NOT NULL,
        migrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dossier_id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      INSERT IGNORE INTO dossier_procedure_legacy_audit
        (dossier_id, tenant_id, legacy_data)
      SELECT id, tenant_id, JSON_OBJECT(
        'appeal_decision', appeal_decision,
        'remand_jurisdiction', remand_jurisdiction,
        'first_instance_decision', first_instance_decision,
        'appeal_possibility', appeal_possibility,
        'appeal_deadline', appeal_deadline,
        'appeal_filed', appeal_filed,
        'cassation_possibility', cassation_possibility,
        'current_decision_type', current_decision_type,
        'cassation_deadline', cassation_deadline,
        'cassation_filed', cassation_filed,
        'execution_date', execution_date
      )
      FROM dossiers
    `);

    for (const column of LEGACY_COLUMNS) {
      if (await queryRunner.hasColumn('dossiers', column)) {
        await queryRunner.query(`ALTER TABLE dossiers DROP COLUMN ${column}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const definitions: Record<(typeof LEGACY_COLUMNS)[number], string> = {
      appeal_decision: 'TEXT NULL',
      remand_jurisdiction: 'TEXT NULL',
      first_instance_decision: 'TEXT NULL',
      appeal_possibility: 'TINYINT(1) NOT NULL DEFAULT 0',
      appeal_deadline: 'DATE NULL',
      appeal_filed: 'TINYINT(1) NOT NULL DEFAULT 0',
      cassation_possibility: 'TINYINT(1) NOT NULL DEFAULT 0',
      current_decision_type: "ENUM('FIRST_INSTANCE','APPEAL','CASSATION') NULL",
      cassation_deadline: 'DATE NULL',
      cassation_filed: 'TINYINT(1) NOT NULL DEFAULT 0',
      execution_date: 'DATE NULL',
    };
    for (const column of LEGACY_COLUMNS) {
      if (!(await queryRunner.hasColumn('dossiers', column))) {
        await queryRunner.query(
          `ALTER TABLE dossiers ADD COLUMN ${column} ${definitions[column]}`,
        );
      }
    }
    await queryRunner.query(`
      UPDATE dossiers d
      INNER JOIN dossier_procedure_legacy_audit a ON a.dossier_id = d.id
      SET
        d.appeal_decision = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.appeal_decision')),
        d.remand_jurisdiction = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.remand_jurisdiction')),
        d.first_instance_decision = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.first_instance_decision')),
        d.appeal_possibility = COALESCE(JSON_EXTRACT(a.legacy_data, '$.appeal_possibility'), 0),
        d.appeal_deadline = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.appeal_deadline')),
        d.appeal_filed = COALESCE(JSON_EXTRACT(a.legacy_data, '$.appeal_filed'), 0),
        d.cassation_possibility = COALESCE(JSON_EXTRACT(a.legacy_data, '$.cassation_possibility'), 0),
        d.current_decision_type = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.current_decision_type')),
        d.cassation_deadline = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.cassation_deadline')),
        d.cassation_filed = COALESCE(JSON_EXTRACT(a.legacy_data, '$.cassation_filed'), 0),
        d.execution_date = JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.execution_date'))
    `);
  }
}
