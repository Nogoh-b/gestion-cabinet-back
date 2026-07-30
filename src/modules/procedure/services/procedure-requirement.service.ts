import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ProcedureRequirement,
  ProcedureRequirementResult,
  ProcedureRequirementType,
} from '../interfaces/procedure-requirement.interface';
import { Stage } from '../entities/stage.entity';
import { StageVisit } from '../entities/stage-visit.entity';
import { SubStageVisit } from '../entities/sub-stage-visit.entity';

@Injectable()
export class ProcedureRequirementService {
  async evaluate(
    manager: EntityManager,
    instanceId: string,
    subStageVisit: SubStageVisit,
    requirements: ProcedureRequirement[],
  ): Promise<ProcedureRequirementResult[]> {
    const results: ProcedureRequirementResult[] = [];
    for (const requirement of requirements ?? []) {
      let satisfied = false;
      let details: Record<string, any> = {};
      try {
        switch (requirement.type) {
          case ProcedureRequirementType.DOCUMENT_ACCEPTED: {
            const params: any[] = [subStageVisit.id];
            let typeClause = '';
            if (requirement.documentTypeId) {
              typeClause = ' AND d.document_type_id = ?';
              params.push(requirement.documentTypeId);
            }
            const [row] = await manager.query(
              `SELECT COUNT(*) AS count
               FROM sub_stage_visit_documents link
               INNER JOIN document_customer d ON d.id = link.document_id
               INNER JOIN document_versions v ON v.id = d.current_version_id
               WHERE link.sub_stage_visit_id = ?
                 AND d.deleted_at IS NULL
                 AND v.deleted_at IS NULL
                 AND v.status = 'ACCEPTED'
                 ${typeClause}`,
              params,
            );
            details = { count: Number(row?.count ?? 0) };
            satisfied = details.count > 0;
            break;
          }
          case ProcedureRequirementType.AUDIENCE_HELD: {
            const [row] = await manager.query(
              `SELECT COUNT(*) AS count
               FROM audiences
               WHERE sub_stage_visit_id = ?
                 AND status = 1
                 AND deleted_at IS NULL`,
              [subStageVisit.id],
            );
            details = { count: Number(row?.count ?? 0) };
            satisfied = details.count > 0;
            break;
          }
          case ProcedureRequirementType.DILIGENCE_COMPLETED: {
            const [row] = await manager.query(
              `SELECT COUNT(*) AS count
               FROM diligences
               WHERE sub_stage_visit_id = ?
                 AND status = 'completed'
                 AND deleted_at IS NULL`,
              [subStageVisit.id],
            );
            details = { count: Number(row?.count ?? 0) };
            satisfied = details.count > 0;
            break;
          }
          case ProcedureRequirementType.TASK_COMPLETED: {
            const params: any[] = [instanceId];
            const taskClause = requirement.taskId ? ' AND id = ?' : '';
            if (requirement.taskId) params.push(requirement.taskId);
            const [row] = await manager.query(
              `SELECT COUNT(*) AS count
               FROM tasks
               WHERE instanceId = ?
                 AND status = 'completed'
                 AND deleted_at IS NULL${taskClause}`,
              params,
            );
            details = { count: Number(row?.count ?? 0) };
            satisfied = details.count > 0;
            break;
          }
          case ProcedureRequirementType.INVOICE_ISSUED:
          case ProcedureRequirementType.INVOICE_PAID: {
            const expected =
              requirement.type === ProcedureRequirementType.INVOICE_PAID
                ? '= 3'
                : 'IN (1, 2, 3, 4)';
            const [row] = await manager.query(
              `SELECT COUNT(*) AS count
               FROM factures
               WHERE sub_stage_visit_id = ?
                 AND status ${expected}
                 AND deleted_at IS NULL`,
              [subStageVisit.id],
            );
            details = { count: Number(row?.count ?? 0) };
            satisfied = details.count > 0;
            break;
          }
          case ProcedureRequirementType.FIELD_REQUIRED: {
            const value = this.readPath(
              subStageVisit.metadata ?? {},
              requirement.field ?? '',
            );
            satisfied = value !== undefined && value !== null && value !== '';
            details = { field: requirement.field };
            break;
          }
          case ProcedureRequirementType.APPROVAL: {
            const approvals = Array.isArray(subStageVisit.metadata?.approvals)
              ? subStageVisit.metadata.approvals
              : [];
            const matching = requirement.approvalRole
              ? approvals.filter(
                  (approval: any) =>
                    approval?.role === requirement.approvalRole &&
                    approval?.approved === true,
                )
              : approvals.filter(
                  (approval: any) => approval?.approved === true,
                );
            const distinctActors = new Set(
              matching.map((approval: any) => approval.actorId).filter(Boolean),
            );
            const requiredCount = Math.max(
              1,
              requirement.approvalCount ?? 1,
            );
            satisfied = distinctActors.size >= requiredCount;
            details = { count: distinctActors.size, requiredCount };
            break;
          }
          case ProcedureRequirementType.DECISION_VALIDATED:
          default:
            // Tout type inconnu ou non encore matérialisé échoue de manière
            // restrictive et ne peut jamais ouvrir une transition.
            satisfied = false;
            details = { reason: 'UNSUPPORTED_OR_UNKNOWN_REQUIREMENT' };
        }
      } catch (error) {
        // Une incohérence de données ou une erreur technique ne doit jamais
        // se transformer en autorisation implicite.
        satisfied = false;
        details = {
          reason: 'REQUIREMENT_EVALUATION_ERROR',
          error:
            error instanceof Error
              ? error.message.substring(0, 250)
              : 'unknown',
        };
      }
      results.push({
        id: requirement.id,
        type: requirement.type,
        label: requirement.label ?? requirement.type,
        satisfied,
        details,
      });
    }
    return results;
  }

  async getStageBlockingRequirements(
    manager: EntityManager,
    instanceId: string,
    stage: Stage,
    stageVisit: StageVisit,
  ): Promise<ProcedureRequirementResult[]> {
    const blocking: ProcedureRequirementResult[] = [];
    const visits = stageVisit.subStageVisits ?? [];

    for (const subStage of stage.subStages ?? []) {
      if (!subStage.isMandatory) continue;
      const visit = [...visits]
        .filter((item) => item.subStageId === subStage.id)
        .sort(
          (left, right) =>
            new Date(right.startedAt).getTime() -
            new Date(left.startedAt).getTime(),
        )[0];
      if (!visit?.isCompleted) {
        blocking.push({
          id: `sub-stage:${subStage.id}`,
          type: 'SUB_STAGE_COMPLETED',
          label: subStage.name,
          subStageId: subStage.id,
          subStageName: subStage.name,
          satisfied: false,
          details: { reason: 'SUB_STAGE_NOT_COMPLETED' },
        });
        continue;
      }

      const results = await this.evaluate(
        manager,
        instanceId,
        visit,
        subStage.requirements ?? [],
      );
      blocking.push(
        ...results
          .filter((result) => !result.satisfied)
          .map((result) => ({
            ...result,
            subStageId: subStage.id,
            subStageName: subStage.name,
          })),
      );
    }
    return blocking;
  }

  async getInstanceBlockingRequirements(
    manager: EntityManager,
    instanceId: string,
    stages: Stage[],
    stageVisits: StageVisit[],
  ): Promise<ProcedureRequirementResult[]> {
    const blocking: ProcedureRequirementResult[] = [];
    for (const stage of stages ?? []) {
      const latestVisit = (stageVisits ?? [])
        .filter((visit) => visit.stageId === stage.id)
        .sort((left, right) => right.visitNumber - left.visitNumber)[0];
      if (!latestVisit) {
        for (const subStage of stage.subStages ?? []) {
          if (!subStage.isMandatory) continue;
          blocking.push({
            id: `sub-stage:${subStage.id}`,
            type: 'SUB_STAGE_COMPLETED',
            label: subStage.name,
            subStageId: subStage.id,
            subStageName: subStage.name,
            satisfied: false,
            details: { reason: 'STAGE_NOT_VISITED' },
          });
        }
        continue;
      }
      blocking.push(
        ...(await this.getStageBlockingRequirements(
          manager,
          instanceId,
          stage,
          latestVisit,
        )),
      );
    }
    return blocking;
  }

  private readPath(value: any, path: string): any {
    if (!path) return undefined;
    return path.split('.').reduce((current, key) => current?.[key], value);
  }
}
