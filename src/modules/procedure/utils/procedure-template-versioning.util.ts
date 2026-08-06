import { createHash } from 'crypto';

import { ProcedureTemplate } from '../entities/procedure-template.entity';

function parseJsonValue(value: any): any {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function buildProcedureTemplateSnapshot(
  template: ProcedureTemplate,
): Record<string, any> {
  const stages = [...(template.stages ?? [])]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      description: stage.description ?? null,
      order: stage.order,
      canBeSkipped: stage.canBeSkipped,
      canBeReentered: stage.canBeReentered,
      config: stage.config
        ? {
            allowDocuments: stage.config.allowDocuments,
            allowDiligences: stage.config.allowDiligences,
            allowInvoices: stage.config.allowInvoices,
            allowHearings: stage.config.allowHearings,
            documentTypesAllowed:
              parseJsonValue(stage.config.documentTypesAllowed) ?? [],
            diligenceConfig:
              parseJsonValue(stage.config.diligenceConfig) ?? null,
            hearingConfig:
              parseJsonValue(stage.config.hearingConfig) ?? null,
            invoiceConfig:
              parseJsonValue(stage.config.invoiceConfig) ?? null,
          }
        : null,
      subStages: [...(stage.subStages ?? [])]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((subStage) => ({
          id: subStage.id,
          name: subStage.name,
          description: subStage.description ?? null,
          order: subStage.order,
          isMandatory: subStage.isMandatory,
          requirements: (subStage.requirements ?? []).map((requirement) => ({
            ...requirement,
          })),
        })),
    }));

  return {
    familyId: template.familyId,
    versionId: template.id,
    version: template.version,
    name: template.name,
    description: template.description ?? null,
    stages,
    transitions: [...(template.transitions ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((transition) => ({
        id: transition.id,
        fromStageId: transition.fromStageId,
        toStageId: transition.toStageId,
        type: transition.type,
        label: transition.label ?? null,
        condition: parseJsonValue(transition.condition),
        triggerEvent: transition.triggerEvent ?? null,
        triggerCondition: parseJsonValue(transition.triggerCondition),
        isDefault: transition.isDefault,
        requiresDecision: transition.requiresDecision,
        requiresValidation: transition.requiresValidation,
        onTransition: parseJsonValue(transition.onTransition),
      })),
    cycles: [...(template.cycles ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((cycle) => ({
        id: cycle.id,
        fromStageId: cycle.fromStageId,
        toStageId: cycle.toStageId,
        label: cycle.label ?? null,
        condition: parseJsonValue(cycle.condition),
        maxLoops: cycle.maxLoops,
      })),
  };
}

export function hashProcedureTemplateSnapshot(
  snapshot: Record<string, any>,
): string {
  return createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
}
