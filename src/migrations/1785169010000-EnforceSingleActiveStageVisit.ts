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

    if (!(await queryRunner.hasColumn('stage_visits', 'active_instance_id'))) {
      await queryRunner.query(`
        ALTER TABLE stage_visits
          ADD COLUMN active_instance_id VARCHAR(255)
            GENERATED ALWAYS AS (
              CASE WHEN exitedAt IS NULL THEN instanceId ELSE NULL END
            ) VIRTUAL
      `);
    }
    if (
      !(await this.hasIndex(queryRunner, 'uq_stage_visit_active_instance'))
    ) {
      await queryRunner.query(`
        ALTER TABLE stage_visits
          ADD UNIQUE KEY uq_stage_visit_active_instance (active_instance_id)
      `);
    }
    if (!(await this.hasIndex(queryRunner, 'uq_stage_visit_number'))) {
      await this.repairDuplicateVisitNumbers(queryRunner);
      await queryRunner.query(`
        ALTER TABLE stage_visits
          ADD UNIQUE KEY uq_stage_visit_number (tenant_id, instanceId, stageId, visitNumber)
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasIndex(queryRunner, 'uq_stage_visit_number')) {
      await queryRunner.query(
        'ALTER TABLE stage_visits DROP INDEX uq_stage_visit_number',
      );
    }
    if (await this.hasIndex(queryRunner, 'uq_stage_visit_active_instance')) {
      await queryRunner.query(
        'ALTER TABLE stage_visits DROP INDEX uq_stage_visit_active_instance',
      );
    }
    if (await queryRunner.hasColumn('stage_visits', 'active_instance_id')) {
      await queryRunner.query(
        'ALTER TABLE stage_visits DROP COLUMN active_instance_id',
      );
    }
  }

  private async hasIndex(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const rows: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'stage_visits'
         AND INDEX_NAME = ?`,
      [indexName],
    );
    return rows.length > 0;
  }

  private async repairDuplicateVisitNumbers(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const visits: Array<{
      id: string;
      tenant_id: number;
      instanceId: string;
      stageId: string;
      visitNumber: number;
    }> = await queryRunner.query(`
      SELECT id, tenant_id, instanceId, stageId, visitNumber
      FROM stage_visits
      ORDER BY tenant_id, instanceId, stageId, enteredAt, id
    `);
    const groups = new Map<string, typeof visits>();
    for (const visit of visits) {
      const key = `${visit.tenant_id}:${visit.instanceId}:${visit.stageId}`;
      const group = groups.get(key) ?? [];
      group.push(visit);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const used = new Set<number>();
      let nextVisitNumber =
        Math.max(0, ...group.map((visit) => Number(visit.visitNumber))) + 1;
      for (const visit of group) {
        const visitNumber = Number(visit.visitNumber);
        if (!used.has(visitNumber)) {
          used.add(visitNumber);
          continue;
        }

        const repairedVisitNumber = nextVisitNumber++;
        await queryRunner.query(
          'UPDATE stage_visits SET visitNumber = ? WHERE id = ?',
          [repairedVisitNumber, visit.id],
        );
        await queryRunner.query(
          `INSERT IGNORE INTO procedure_repair_issues
            (issue_key, issue_type, tenant_id, resource_type, resource_id, details, status, resolved_at)
           VALUES (?, 'DUPLICATE_STAGE_VISIT_NUMBER', ?, 'stage_visit', ?, ?, 'REPAIRED', UTC_TIMESTAMP())`,
          [
            `DUPLICATE_STAGE_VISIT_NUMBER:${visit.id}`,
            visit.tenant_id,
            visit.id,
            JSON.stringify({
              instanceId: visit.instanceId,
              stageId: visit.stageId,
              previousVisitNumber: visitNumber,
              repairedVisitNumber,
            }),
          ],
        );
        used.add(repairedVisitNumber);
      }
    }
  }
}
