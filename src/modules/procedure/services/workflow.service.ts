// services/workflow.service.ts
import * as jsonLogic from 'json-logic-js';
import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkflowService {
  /**
   * Évalue une condition JSON Logic. Toute condition absente est neutre ;
   * toute condition illisible ou non strictement vraie est refusée.
   */
  async evaluateCondition(condition: any, context: any): Promise<boolean> {
    if (!condition) return true;

    try {
      const parsedCondition =
        typeof condition === 'string' ? JSON.parse(condition) : condition;
      if (
        !parsedCondition ||
        typeof parsedCondition !== 'object' ||
        Array.isArray(parsedCondition)
      ) {
        return false;
      }
      const completedFromVisit = Array.isArray(
        context.stageVisit?.subStageVisits,
      )
        ? context.stageVisit.subStageVisits
            .filter((visit: any) => visit?.isCompleted === true)
            .map((visit: any) => visit.subStageId)
        : [];
      const completedSubStageIds = [
        ...new Set(
          [
            ...(Array.isArray(context.completedSubStageIds)
              ? context.completedSubStageIds
              : []),
            ...(Array.isArray(context.instance?.completedSubStageIds)
              ? context.instance.completedSubStageIds
              : []),
            ...completedFromVisit,
          ].filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
        ),
      ];
      const vars: Record<string, any> = {};

      if (context.instance) {
        vars.instance = {
          data: context.instance.data,
          completedSubStageIds,
          // Alias de langage de condition conservé pour les templates
          // publiés, alimenté uniquement par la projection canonique.
          completedSubStages: completedSubStageIds,
        };
      }
      if (context.subStage) vars.subStage = context.subStage;
      if (context.stageVisit) {
        vars.stageVisit = {
          ...context.stageVisit,
          completedSubStageIds: completedFromVisit,
          completedSubStages: completedFromVisit,
        };
      }
      if (context.stage) vars.stage = context.stage;
      if (context.event) vars.event = context.event;

      if (!jsonLogic || typeof jsonLogic.apply !== 'function') {
        return false;
      }
      return jsonLogic.apply(parsedCondition, vars) === true;
    } catch {
      return false;
    }
  }
}
