import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceSingleActiveStageVisit1785169010000
  implements MigrationInterface
{
  name = 'EnforceSingleActiveStageVisit1785169010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const activeVisits: Array<{
      id: string;
      instanceId: string;
      enteredAt: Date;
      tenant_id: number;
    }> = await queryRunner.query(`
      SELECT id, instanceId, enteredAt, tenant_id
      FROM stage_visits
      WHERE exitedAt IS NULL
      ORDER BY instanceId, enteredAt DESC, id DESC
    `);
    const kept = new Set<string>();
    for (const visit of activeVisits) {
      if (!kept.has(visit.instanceId)) {
        kept.add(visit.instanceId);
        continue;
      }
      await queryRunner.query(
        `UPDATE stage_visits SET exitedAt = UTC_TIMESTAMP() WHERE id = ?`,
        [visit.id],
      );
      await queryRunner.query(
        `INSERT IGNORE INTO procedure_repair_issues
          (issue_key, issue_type, tenant_id, resource_type, resource_id, details, status, resolved_at)
         VALUES (?, 'MULTIPLE_ACTIVE_VISITS', ?, 'stage_visit', ?, ?, 'REPAIRED', UTC_TIMESTAMP())`,
        [
          `MULTIPLE_ACTIVE_VISITS:${visit.id}`,
          visit.tenant_id,
          visit.id,
          JSON.stringify({
            instanceId: visit.instanceId,
            action: 'closed_duplicate_active_visit',
          }),
        ],
      );
    }

    await queryRunner.query(`
      ALTER TABLE stage_visits
        ADD COLUMN active_instance_id CHAR(36)
          GENERATED ALWAYS AS (
            CASE WHEN exitedAt IS NULL THEN instanceId ELSE NULL END
          ) STORED,
        ADD UNIQUE KEY uq_stage_visit_active_instance (active_instance_id),
        ADD UNIQUE KEY uq_stage_visit_number (tenant_id, instanceId, stageId, visitNumber)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stage_visits
        DROP INDEX uq_stage_visit_number,
        DROP INDEX uq_stage_visit_active_instance,
        DROP COLUMN active_instance_id
    `);
  }
}
