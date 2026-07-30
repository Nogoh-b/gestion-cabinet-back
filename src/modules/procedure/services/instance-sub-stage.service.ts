// procedure/services/instance-sub-stage.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { ProcedureTemplate } from '../entities/procedure-template.entity';
import { StageVisit } from '../entities/stage-visit.entity';
import { MappedInstance, MappedStage, MappedSubStage, StageStatus, SubStageStatus } from '../entities/type/instance-status.enum';

@Injectable()
export class InstanceMapperService {

  /**
   * Mappe une instance avec la visite courante
   */
// Dans instance-sub-stage.service.ts
async mapInstanceWithCurrentTemplate(
  instance: ProcedureInstance,
  currentTemplate: ProcedureTemplate,
  currentStageVisit: StageVisit,
): Promise<MappedInstance> {
  const visits =
    instance.stageVisits?.length > 0
      ? instance.stageVisits
      : [currentStageVisit];
  const latestVisitByStage = new Map<string, StageVisit>();
  for (const visit of visits) {
    const latest = latestVisitByStage.get(visit.stageId);
    if (!latest || visit.visitNumber > latest.visitNumber) {
      latestVisitByStage.set(visit.stageId, visit);
    }
  }

  const mappedStages: MappedStage[] = currentTemplate.stages.map((stage) => {
    const stageVisit = latestVisitByStage.get(stage.id);
    const subStageVisitsMap = new Map(
      (stageVisit?.subStageVisits ?? []).map((visit) => [
        visit.subStageId,
        visit,
      ]),
    );
    const mappedSubStages: MappedSubStage[] = stage.subStages.map((subStage) => {
      const subVisit = subStageVisitsMap.get(subStage.id);
      const metadata = subVisit?.metadata || {};

      let status: SubStageStatus = 'pending';

      if (subVisit?.isCompleted === true) {
        status = 'completed';
      } else if (metadata.startedAt && !metadata.completedAt) {
        status = 'in_progress';
      }

      return {
        id: subStage.id,
        name: subStage.name,
        description: subStage.description,
        order: subStage.order,
        isMandatory: subStage.isMandatory,
        status,
        metadata: {
          startedAt: metadata.startedAt,
          completedAt: metadata.completedAt,
          notes: metadata.notes,
        },
      };
    });

    // Calcul de la progression (correction ici)
    const progress = this.calculateStageProgress(stage, mappedSubStages);

    const status = this.calculateStageStatus(
      stage.id,
      mappedSubStages,
      instance.currentStageId,
      stageVisit,
    );

    return {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      order: stage.order,
      canBeSkipped: stage.canBeSkipped,
      canBeReentered: stage.canBeReentered,
      subStages: mappedSubStages,
      progress,
      status,
      config: stage.config,
    };
  });

  const currentStage = mappedStages.find((s) => s.id === instance.currentStageId);
  if (!currentStage) {
    throw new BadRequestException(
      "L'étape courante n'appartient pas à la version du template",
    );
  }

  return {
    instance,
    stages: mappedStages,
    currentStage,
    progress: this.calculateOverallProgress(mappedStages),

    // Tes propriétés calculées existantes (gardées pour compatibilité frontend)
    totalSubStagesCount: instance.totalSubStagesCount,
    totalMandatorySubStagesCount: instance.totalMandatorySubStagesCount,
    completedSubStagesCount: instance.completedSubStagesCount,
    completedMandatorySubStagesCount: instance.completedMandatorySubStagesCount,
    remainingSubStagesCount: instance.remainingSubStagesCount,
    remainingMandatorySubStagesCount: instance.remainingMandatorySubStagesCount,
    totalSubStagesToCompleteCount: instance.totalSubStagesToCompleteCount,
    completedSubStagesToCompleteCount: instance.completedSubStagesToCompleteCount,
    progressPercentage: instance.progressPercentage,
    isCurrentStageCompleted: instance.isCurrentStageCompleted,
    areAllMandatorySubStagesCompleted: instance.areAllMandatorySubStagesCompleted,
    isFullyCompleted: instance.isFullyCompleted,
    isOnLastStage: instance.isOnLastStage,
    areAllCurrentStageSubStagesCompleted: instance.areAllCurrentStageSubStagesCompleted,
    currentStageProgress: instance.currentStageProgress,
    remainingMandatorySubStages: instance.remainingMandatorySubStages,
    canBeCompleted: instance.canBeCompleted,
    stagesTraversedCount: instance.stagesTraversedCount,
    totalDurationInDays: instance.totalDurationInDays,
    completedAt: instance.completedAt,
  };
}

private calculateStageProgress(
  stage: any,
  mappedSubStages: MappedSubStage[]
): number {
  if (!stage.subStages || stage.subStages.length === 0) return 0;

  const mandatorySubStages = mappedSubStages.filter((ss) => ss.isMandatory);
  if (mandatorySubStages.length === 0) return 100;

  const completedCount = mandatorySubStages.filter((ss) => ss.status === 'completed').length;

  return Math.round((completedCount / mandatorySubStages.length) * 100);
}

/**
 * Calcule le statut d'une étape
 */
private calculateStageStatus(
  stageId: string,
  mappedSubStages: MappedSubStage[],
  currentStageId: string,
  stageVisit?: StageVisit,
): StageStatus {
  if (stageId === currentStageId) {
    return 'current';
  }

  const mandatorySubStages = mappedSubStages.filter((ss) => ss.isMandatory);
  const allMandatoryCompleted = mandatorySubStages.length === 0 ||
    mandatorySubStages.every((ss) => ss.status === 'completed');

  if (
    allMandatoryCompleted &&
    (mandatorySubStages.length > 0 || Boolean(stageVisit?.exitedAt))
  ) {
    return 'completed';
  }

  const hasInProgress = mappedSubStages.some((ss) => ss.status === 'in_progress');
  if (hasInProgress) return 'in_progress';

  return 'pending';
}

/**
 * Calcule la progression globale
 */
private calculateOverallProgress(stages: MappedStage[]): number {
  let totalMandatory = 0;
  let completedMandatory = 0;

  for (const stage of stages) {
    const mandatory = stage.subStages.filter((ss) => ss.isMandatory);
    totalMandatory += mandatory.length;
    completedMandatory += mandatory.filter((ss) => ss.status === 'completed').length;
  }

  return totalMandatory > 0 
    ? Math.round((completedMandatory / totalMandatory) * 100)
    : 0;
}
}
