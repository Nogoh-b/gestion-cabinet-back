import { createHash, randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  JsonObject,
  legacyObject,
  legacyStringList,
  parseLegacyJson,
  selectUnambiguousVisit,
} from './support/legacy-procedure-state';

interface LegacyInstanceRow {
  id: string;
  tenant_id: number;
  template_version_id: string;
  currentStageId: string;
  created_at: Date;
  updated_at: Date;
  completedSubStages: unknown;
  cycleUsageCount: unknown;
  subStageMetadata: unknown;
}

interface LegacyVisitRow {
  id: string;
  tenant_id: number;
  instanceId: string;
  stageId: string;
  visitNumber: number;
  enteredAt: Date;
  exitedAt: Date | null;
  completedSubStages: unknown;
  subStageMetadata: unknown;
}

interface SubStageRow {
  id: string;
  tenant_id: number;
  stageId: string;
}

interface SubStageVisitRow {
  id: string;
  tenant_id: number;
  stageVisitId: string;
  subStageId: string;
  isCompleted: number | boolean;
  metadata: unknown;
}

interface CycleRow {
  id: string;
  tenant_id: number;
  templateId: string;
  fromStageId: string;
  toStageId: string;
}

export class MigrateLegacyProcedureInstanceState1785169045000
  implements MigrationInterface
{
  name = 'MigrateLegacyProcedureInstanceState1785169045000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE procedure_legacy_state_archive (
        id CHAR(36) NOT NULL,
        tenant_id INT NOT NULL,
        source_type VARCHAR(40) NOT NULL,
        source_id VARCHAR(255) NOT NULL,
        payload JSON NOT NULL,
        payload_hash CHAR(64) NOT NULL,
        archived_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_procedure_legacy_archive_source
          (tenant_id, source_type, source_id),
        KEY idx_procedure_legacy_archive_tenant (tenant_id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_procedure_legacy_archive_no_update
      BEFORE UPDATE ON procedure_legacy_state_archive
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'procedure_legacy_state_archive is append-only'
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_procedure_legacy_archive_no_delete
      BEFORE DELETE ON procedure_legacy_state_archive
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'procedure_legacy_state_archive is append-only'
    `);
    await queryRunner.query(`
      CREATE TABLE procedure_legacy_migration_issues (
        id BIGINT NOT NULL AUTO_INCREMENT,
        issue_key VARCHAR(255) NOT NULL,
        issue_type VARCHAR(80) NOT NULL,
        tenant_id INT NOT NULL,
        instance_id VARCHAR(36) NOT NULL,
        resource_type VARCHAR(40) NOT NULL,
        resource_id VARCHAR(255) NOT NULL,
        details JSON NOT NULL,
        resolution_status ENUM('PENDING','RESOLVED','WAIVED')
          NOT NULL DEFAULT 'PENDING',
        resolved_by_id VARCHAR(255) NULL,
        resolution_note TEXT NULL,
        resolved_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_procedure_legacy_issue (issue_key),
        KEY idx_procedure_legacy_issue_tenant_status
          (tenant_id, resolution_status)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      ALTER TABLE history_entries
        ADD COLUMN cycleId VARCHAR(36) NULL AFTER subStageId,
        ADD KEY idx_history_cycle_usage
          (tenant_id, instanceId, eventType, cycleId)
    `);
    await queryRunner.query(`
      UPDATE history_entries
      SET cycleId = LEFT(
        JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.cycleId')),
        36
      )
      WHERE eventType = 'cycle_applied'
        AND cycleId IS NULL
        AND metadata IS NOT NULL
        AND JSON_EXTRACT(metadata, '$.cycleId') IS NOT NULL
    `);

    const instances = (await queryRunner.query(`
      SELECT id, tenant_id, template_version_id, currentStageId,
             created_at, updated_at, completedSubStages,
             cycleUsageCount, subStageMetadata
      FROM procedure_instances
      ORDER BY tenant_id, id
    `)) as LegacyInstanceRow[];
    const visits = (await queryRunner.query(`
      SELECT id, tenant_id, instanceId, stageId, visitNumber,
             enteredAt, exitedAt, completedSubStages, subStageMetadata
      FROM stage_visits
      ORDER BY instanceId, stageId, visitNumber
    `)) as LegacyVisitRow[];
    const subStages = (await queryRunner.query(`
      SELECT id, tenant_id, stageId
      FROM sub_stages
    `)) as SubStageRow[];
    const cycles = (await queryRunner.query(`
      SELECT id, tenant_id, templateId, fromStageId, toStageId
      FROM cycles
    `)) as CycleRow[];
    const subStageVisits = (await queryRunner.query(`
      SELECT id, tenant_id, stageVisitId, subStageId,
             isCompleted, metadata
      FROM sub_stage_visits
      ORDER BY stageVisitId, subStageId, created_at, id
    `)) as SubStageVisitRow[];

    const subStageById = new Map(subStages.map((row) => [row.id, row]));
    const cycleById = new Map(cycles.map((row) => [row.id, row]));
    const visitsByInstanceStage = new Map<string, LegacyVisitRow[]>();
    for (const visit of visits) {
      const key = `${visit.instanceId}:${visit.stageId}`;
      const values = visitsByInstanceStage.get(key) ?? [];
      values.push(visit);
      visitsByInstanceStage.set(key, values);
    }
    const subVisitsByVisitAndSubStage = new Map<
      string,
      SubStageVisitRow[]
    >();
    for (const subVisit of subStageVisits) {
      const key = `${subVisit.stageVisitId}:${subVisit.subStageId}`;
      const values = subVisitsByVisitAndSubStage.get(key) ?? [];
      values.push(subVisit);
      subVisitsByVisitAndSubStage.set(key, values);
    }

    for (const [key, values] of subVisitsByVisitAndSubStage) {
      if (values.length <= 1) continue;
      const visit = visits.find(
        (candidate) => candidate.id === values[0].stageVisitId,
      );
      if (!visit) continue;
      await this.issue(queryRunner, {
        issueKey: `DUPLICATE_SUB_STAGE_VISIT:${key}`,
        issueType: 'DUPLICATE_SUB_STAGE_VISIT',
        tenantId: visit.tenant_id,
        instanceId: visit.instanceId,
        resourceType: 'sub_stage_visit',
        resourceId: key,
        details: { ids: values.map((value) => value.id) },
      });
    }

    for (const visit of visits) {
      const payload = {
        completedSubStages: parseLegacyJson(visit.completedSubStages),
        subStageMetadata: parseLegacyJson(visit.subStageMetadata),
      };
      await this.archive(
        queryRunner,
        visit.tenant_id,
        'stage_visit',
        visit.id,
        payload,
      );
      const completedIds = legacyStringList(visit.completedSubStages);
      const metadata = legacyObject(visit.subStageMetadata);
      const claimedIds = new Set([...completedIds, ...Object.keys(metadata)]);
      for (const subStageId of claimedIds) {
        await this.migrateSubStageClaim(queryRunner, {
          sourceType: 'stage_visit',
          sourceId: visit.id,
          instanceId: visit.instanceId,
          tenantId: visit.tenant_id,
          visit,
          subStageId,
          shouldComplete: completedIds.includes(subStageId),
          legacyMetadata: metadata[subStageId],
          subStageById,
          subVisitsByVisitAndSubStage,
        });
      }
    }

    for (const instance of instances) {
      const payload = {
        completedSubStages: parseLegacyJson(instance.completedSubStages),
        cycleUsageCount: parseLegacyJson(instance.cycleUsageCount),
        subStageMetadata: parseLegacyJson(instance.subStageMetadata),
      };
      await this.archive(
        queryRunner,
        instance.tenant_id,
        'procedure_instance',
        instance.id,
        payload,
      );
      const completedIds = legacyStringList(instance.completedSubStages);
      const metadata = legacyObject(instance.subStageMetadata);
      const claimedIds = new Set([...completedIds, ...Object.keys(metadata)]);
      for (const subStageId of claimedIds) {
        const subStage = subStageById.get(subStageId);
        if (!subStage || subStage.tenant_id !== instance.tenant_id) {
          await this.issueUnknownSubStage(
            queryRunner,
            instance,
            subStageId,
            'procedure_instance',
            instance.id,
          );
          continue;
        }
        const candidateVisits =
          visitsByInstanceStage.get(
            `${instance.id}:${subStage.stageId}`,
          ) ?? [];
        const completedVisitIds = candidateVisits
          .filter((visit) =>
            (subVisitsByVisitAndSubStage.get(
              `${visit.id}:${subStageId}`,
            ) ?? []).some((subVisit) => Boolean(subVisit.isCompleted)),
          )
          .map((visit) => visit.id);
        const targetVisitId = selectUnambiguousVisit(
          candidateVisits,
          completedVisitIds,
        );
        const targetVisit = candidateVisits.find(
          (visit) => visit.id === targetVisitId,
        );
        if (!targetVisit) {
          await this.issue(queryRunner, {
            issueKey:
              `AMBIGUOUS_LEGACY_SUB_STAGE:${instance.id}:${subStageId}`,
            issueType: 'AMBIGUOUS_LEGACY_SUB_STAGE',
            tenantId: instance.tenant_id,
            instanceId: instance.id,
            resourceType: 'procedure_instance',
            resourceId: instance.id,
            details: {
              subStageId,
              stageId: subStage.stageId,
              candidateVisitIds: candidateVisits.map((visit) => visit.id),
              completedVisitIds,
            },
          });
          continue;
        }
        await this.migrateSubStageClaim(queryRunner, {
          sourceType: 'procedure_instance',
          sourceId: instance.id,
          instanceId: instance.id,
          tenantId: instance.tenant_id,
          visit: targetVisit,
          subStageId,
          shouldComplete: completedIds.includes(subStageId),
          legacyMetadata: metadata[subStageId],
          subStageById,
          subVisitsByVisitAndSubStage,
        });
      }
      await this.migrateCycleCounters(
        queryRunner,
        instance,
        legacyObject(instance.cycleUsageCount),
        cycleById,
      );
    }

    const orphanCycleHistory = (await queryRunner.query(`
      SELECT h.id, h.tenant_id, h.instanceId, h.cycleId
      FROM history_entries h
      LEFT JOIN procedure_instances pi
        ON pi.id = h.instanceId
       AND pi.tenant_id = h.tenant_id
      LEFT JOIN cycles c
        ON c.id = h.cycleId
       AND c.templateId = pi.template_version_id
       AND c.tenant_id = h.tenant_id
      WHERE h.eventType = 'cycle_applied'
        AND (h.cycleId IS NULL OR c.id IS NULL)
    `)) as Array<{
      id: string;
      tenant_id: number;
      instanceId: string;
      cycleId: string | null;
    }>;
    for (const row of orphanCycleHistory) {
      await this.issue(queryRunner, {
        issueKey: `ORPHAN_CYCLE_HISTORY:${row.id}`,
        issueType: 'ORPHAN_CYCLE_HISTORY',
        tenantId: row.tenant_id,
        instanceId: row.instanceId,
        resourceType: 'history_entry',
        resourceId: row.id,
        details: { cycleId: row.cycleId },
      });
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE history_entries
        DROP INDEX idx_history_cycle_usage,
        DROP COLUMN cycleId
    `);
    await queryRunner.query(`DROP TABLE procedure_legacy_migration_issues`);
    await queryRunner.query(`DROP TABLE procedure_legacy_state_archive`);
  }

  private async migrateSubStageClaim(
    queryRunner: QueryRunner,
    input: {
      sourceType: string;
      sourceId: string;
      instanceId: string;
      tenantId: number;
      visit: LegacyVisitRow;
      subStageId: string;
      shouldComplete: boolean;
      legacyMetadata: unknown;
      subStageById: Map<string, SubStageRow>;
      subVisitsByVisitAndSubStage: Map<string, SubStageVisitRow[]>;
    },
  ): Promise<void> {
    const subStage = input.subStageById.get(input.subStageId);
    if (
      !subStage ||
      subStage.tenant_id !== input.tenantId ||
      subStage.stageId !== input.visit.stageId
    ) {
      const instance = {
        id: input.instanceId,
        tenant_id: input.tenantId,
      } as LegacyInstanceRow;
      await this.issueUnknownSubStage(
        queryRunner,
        instance,
        input.subStageId,
        input.sourceType,
        input.sourceId,
      );
      return;
    }
    const key = `${input.visit.id}:${input.subStageId}`;
    const existing = input.subVisitsByVisitAndSubStage.get(key) ?? [];
    if (existing.length > 1) return;
    if (existing.length === 1) {
      const subVisit = existing[0];
      if (input.shouldComplete && !subVisit.isCompleted) {
        await this.issue(queryRunner, {
          issueKey: `LEGACY_COMPLETION_CONFLICT:${key}`,
          issueType: 'LEGACY_COMPLETION_CONFLICT',
          tenantId: input.tenantId,
          instanceId: input.instanceId,
          resourceType: 'sub_stage_visit',
          resourceId: subVisit.id,
          details: {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            subStageId: input.subStageId,
          },
        });
        return;
      }
      if (
        input.legacyMetadata !== undefined &&
        input.legacyMetadata !== null
      ) {
        const metadata = legacyObject(subVisit.metadata);
        const legacyMigrations = Array.isArray(metadata.legacyMigrations)
          ? metadata.legacyMigrations
          : [];
        metadata.legacyMigrations = [
          ...legacyMigrations,
          {
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            value: input.legacyMetadata,
          },
        ];
        await queryRunner.query(
          `UPDATE sub_stage_visits SET metadata = ? WHERE id = ?`,
          [JSON.stringify(metadata), subVisit.id],
        );
        subVisit.metadata = metadata;
      }
      return;
    }
    const metadata = {
      legacyMigrations: [
        {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          value: input.legacyMetadata ?? null,
        },
      ],
    };
    const subVisit: SubStageVisitRow = {
      id: randomUUID(),
      tenant_id: input.tenantId,
      stageVisitId: input.visit.id,
      subStageId: input.subStageId,
      isCompleted: input.shouldComplete,
      metadata,
    };
    await queryRunner.query(
      `INSERT INTO sub_stage_visits
        (id, tenant_id, stageVisitId, subStageId, isCompleted,
         metadata, startedAt, completedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subVisit.id,
        subVisit.tenant_id,
        subVisit.stageVisitId,
        subVisit.subStageId,
        subVisit.isCompleted ? 1 : 0,
        JSON.stringify(metadata),
        input.visit.enteredAt,
        input.shouldComplete
          ? input.visit.exitedAt ?? input.visit.enteredAt
          : null,
      ],
    );
    input.subVisitsByVisitAndSubStage.set(key, [subVisit]);
  }

  private async migrateCycleCounters(
    queryRunner: QueryRunner,
    instance: LegacyInstanceRow,
    counters: JsonObject,
    cycleById: Map<string, CycleRow>,
  ): Promise<void> {
    for (const [cycleId, rawCount] of Object.entries(counters)) {
      const desiredCount = Number(rawCount);
      const cycle = cycleById.get(cycleId);
      if (
        !Number.isInteger(desiredCount) ||
        desiredCount < 0 ||
        !cycle ||
        cycle.tenant_id !== instance.tenant_id ||
        cycle.templateId !== instance.template_version_id
      ) {
        await this.issue(queryRunner, {
          issueKey: `INVALID_LEGACY_CYCLE_COUNTER:${instance.id}:${cycleId}`,
          issueType: 'INVALID_LEGACY_CYCLE_COUNTER',
          tenantId: instance.tenant_id,
          instanceId: instance.id,
          resourceType: 'procedure_instance',
          resourceId: instance.id,
          details: { cycleId, rawCount },
        });
        continue;
      }
      const rows = (await queryRunner.query(
        `SELECT COUNT(*) AS total
         FROM history_entries
         WHERE instanceId = ?
           AND tenant_id = ?
           AND eventType = 'cycle_applied'
           AND cycleId = ?`,
        [instance.id, instance.tenant_id, cycleId],
      )) as Array<{ total: string | number }>;
      const existingCount = Number(rows[0]?.total ?? 0);
      if (existingCount > desiredCount) {
        await this.issue(queryRunner, {
          issueKey:
            `LEGACY_CYCLE_COUNT_CONFLICT:${instance.id}:${cycleId}`,
          issueType: 'LEGACY_CYCLE_COUNT_CONFLICT',
          tenantId: instance.tenant_id,
          instanceId: instance.id,
          resourceType: 'procedure_instance',
          resourceId: instance.id,
          details: { cycleId, desiredCount, existingCount },
        });
        continue;
      }
      for (
        let usageCount = existingCount + 1;
        usageCount <= desiredCount;
        usageCount += 1
      ) {
        await queryRunner.query(
          `INSERT INTO history_entries
            (id, tenant_id, instanceId, eventType, stageId, subStageId,
             cycleId, userId, metadata, createdAt)
           VALUES (?, ?, ?, 'cycle_applied', ?, NULL, ?, NULL, ?, ?)`,
          [
            randomUUID(),
            instance.tenant_id,
            instance.id,
            cycle.toStageId,
            cycleId,
            JSON.stringify({
              cycleId,
              fromStageId: cycle.fromStageId,
              toStageId: cycle.toStageId,
              usageCount,
              migratedFromLegacyCounter: true,
            }),
            instance.updated_at,
          ],
        );
      }
    }
  }

  private async archive(
    queryRunner: QueryRunner,
    tenantId: number,
    sourceType: string,
    sourceId: string,
    payload: JsonObject,
  ): Promise<void> {
    const serialized = JSON.stringify(payload);
    await queryRunner.query(
      `INSERT IGNORE INTO procedure_legacy_state_archive
        (id, tenant_id, source_type, source_id, payload, payload_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        tenantId,
        sourceType,
        sourceId,
        serialized,
        createHash('sha256').update(serialized).digest('hex'),
      ],
    );
  }

  private async issueUnknownSubStage(
    queryRunner: QueryRunner,
    instance: Pick<LegacyInstanceRow, 'id' | 'tenant_id'>,
    subStageId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<void> {
    await this.issue(queryRunner, {
      issueKey:
        `UNKNOWN_LEGACY_SUB_STAGE:${sourceType}:${sourceId}:${subStageId}`,
      issueType: 'UNKNOWN_LEGACY_SUB_STAGE',
      tenantId: instance.tenant_id,
      instanceId: instance.id,
      resourceType: sourceType,
      resourceId: sourceId,
      details: { subStageId },
    });
  }

  private async issue(
    queryRunner: QueryRunner,
    input: {
      issueKey: string;
      issueType: string;
      tenantId: number;
      instanceId: string;
      resourceType: string;
      resourceId: string;
      details: JsonObject;
    },
  ): Promise<void> {
    await queryRunner.query(
      `INSERT IGNORE INTO procedure_legacy_migration_issues
        (issue_key, issue_type, tenant_id, instance_id,
         resource_type, resource_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.issueKey,
        input.issueType,
        input.tenantId,
        input.instanceId,
        input.resourceType,
        input.resourceId,
        JSON.stringify(input.details),
      ],
    );
  }
}
