import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetireLegacyProcedureInstanceState1785169046000
  implements MigrationInterface
{
  name = 'RetireLegacyProcedureInstanceState1785169046000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const pending = (await queryRunner.query(`
      SELECT COUNT(*) AS total
      FROM procedure_legacy_migration_issues
      WHERE resolution_status = 'PENDING'
    `)) as Array<{ total: string | number }>;
    if (Number(pending[0]?.total ?? 0) > 0) {
      throw new Error(
        'Reprise procédurale incomplète : résoudre les entrées PENDING de ' +
          'procedure_legacy_migration_issues avant de retirer les colonnes',
      );
    }
    const missingArchives = (await queryRunner.query(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT pi.tenant_id, 'procedure_instance' AS source_type, pi.id AS source_id
        FROM procedure_instances pi
        LEFT JOIN procedure_legacy_state_archive a
          ON a.tenant_id = pi.tenant_id
         AND a.source_type = 'procedure_instance'
         AND a.source_id = pi.id
        WHERE a.id IS NULL
        UNION ALL
        SELECT sv.tenant_id, 'stage_visit' AS source_type, sv.id AS source_id
        FROM stage_visits sv
        LEFT JOIN procedure_legacy_state_archive a
          ON a.tenant_id = sv.tenant_id
         AND a.source_type = 'stage_visit'
         AND a.source_id = sv.id
        WHERE a.id IS NULL
      ) missing
    `)) as Array<{ total: string | number }>;
    if (Number(missingArchives[0]?.total ?? 0) > 0) {
      throw new Error(
        'Reprise procédurale incomplète : des états historiques ne sont pas archivés',
      );
    }

    await queryRunner.query(`
      ALTER TABLE sub_stage_visits
        ADD UNIQUE KEY uq_sub_stage_visit_per_stage_visit
          (tenant_id, stageVisitId, subStageId)
    `);
    await queryRunner.query(`
      ALTER TABLE stage_visits
        DROP COLUMN completedSubStages,
        DROP COLUMN subStageMetadata
    `);
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        DROP COLUMN completedSubStages,
        DROP COLUMN cycleUsageCount,
        DROP COLUMN subStageMetadata
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE procedure_instances
        ADD COLUMN completedSubStages TEXT NULL,
        ADD COLUMN cycleUsageCount TEXT NULL,
        ADD COLUMN subStageMetadata TEXT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE stage_visits
        ADD COLUMN completedSubStages JSON NULL,
        ADD COLUMN subStageMetadata JSON NULL
    `);
    const archives = (await queryRunner.query(`
      SELECT tenant_id, source_type, source_id, payload
      FROM procedure_legacy_state_archive
      ORDER BY source_type, source_id
    `)) as Array<{
      tenant_id: number;
      source_type: string;
      source_id: string;
      payload: unknown;
    }>;
    for (const archive of archives) {
      const payload = (
        typeof archive.payload === 'string'
          ? JSON.parse(archive.payload)
          : archive.payload
      ) as Record<string, unknown>;
      if (archive.source_type === 'procedure_instance') {
        await queryRunner.query(
          `UPDATE procedure_instances
           SET completedSubStages = ?,
               cycleUsageCount = ?,
               subStageMetadata = ?
           WHERE id = ? AND tenant_id = ?`,
          [
            JSON.stringify(payload.completedSubStages ?? null),
            JSON.stringify(payload.cycleUsageCount ?? null),
            JSON.stringify(payload.subStageMetadata ?? null),
            archive.source_id,
            archive.tenant_id,
          ],
        );
      } else if (archive.source_type === 'stage_visit') {
        await queryRunner.query(
          `UPDATE stage_visits
           SET completedSubStages = ?, subStageMetadata = ?
           WHERE id = ? AND tenant_id = ?`,
          [
            JSON.stringify(payload.completedSubStages ?? null),
            JSON.stringify(payload.subStageMetadata ?? null),
            archive.source_id,
            archive.tenant_id,
          ],
        );
      }
    }
    await queryRunner.query(`
      ALTER TABLE sub_stage_visits
        DROP INDEX uq_sub_stage_visit_per_stage_visit
    `);
  }
}
