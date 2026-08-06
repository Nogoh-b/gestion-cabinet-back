import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_WORKFLOW_COLUMNS = [
  'client_decision',
  'recommendation',
  'analysis_date',
  'analysis_notes',
] as const;

/**
 * Retire les décisions de routage procédural qui étaient encore stockées sur
 * le dossier. Leur valeur est conservée dans un journal de reprise, mais seul
 * le contexte et les transitions de l'instance de template pilotent désormais
 * le parcours.
 */
export class RemoveDossierWorkflowDecisions1785169017000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dossier_workflow_legacy_audit (
        dossier_id INT NOT NULL,
        tenant_id INT NULL,
        legacy_data JSON NOT NULL,
        migrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (dossier_id)
      ) ENGINE=InnoDB
    `);

    const available: string[] = [];
    for (const column of LEGACY_WORKFLOW_COLUMNS) {
      if (await queryRunner.hasColumn('dossiers', column)) {
        available.push(column);
      }
    }

    if (available.length) {
      const jsonArguments = available
        .map((column) => `'${column}', \`${column}\``)
        .join(', ');
      await queryRunner.query(`
        INSERT IGNORE INTO dossier_workflow_legacy_audit
          (dossier_id, tenant_id, legacy_data)
        SELECT id, tenant_id, JSON_OBJECT(${jsonArguments})
        FROM dossiers
      `);
    }

    for (const column of available) {
      await queryRunner.query(
        `ALTER TABLE dossiers DROP COLUMN \`${column}\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const definitions: Record<(typeof LEGACY_WORKFLOW_COLUMNS)[number], string> = {
      client_decision:
        "ENUM('transaction','contentieux','abandon') NULL",
      recommendation:
        "ENUM('transaction','present_options','procedure') NULL",
      analysis_date: 'DATE NULL',
      analysis_notes: 'TEXT NULL',
    };

    for (const column of LEGACY_WORKFLOW_COLUMNS) {
      if (!(await queryRunner.hasColumn('dossiers', column))) {
        await queryRunner.query(
          `ALTER TABLE dossiers ADD COLUMN \`${column}\` ${definitions[column]}`,
        );
      }
    }

    await queryRunner.query(`
      UPDATE dossiers d
      INNER JOIN dossier_workflow_legacy_audit a ON a.dossier_id = d.id
      SET
        d.client_decision =
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.client_decision')), 'null'),
        d.recommendation =
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.recommendation')), 'null'),
        d.analysis_date =
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.analysis_date')), 'null'),
        d.analysis_notes =
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.legacy_data, '$.analysis_notes')), 'null')
    `);
  }
}
