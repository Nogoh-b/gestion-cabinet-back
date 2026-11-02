import { EntityManager } from 'typeorm';

import { Cycle } from '../entities/cycle.entity';
import {
  ProcedureTemplate,
  ProcedureTemplateLifecycle,
} from '../entities/procedure-template.entity';
import { Stage } from '../entities/stage.entity';
import { Transition } from '../entities/transition.entity';
import {
  buildProcedureTemplateSnapshot,
  hashProcedureTemplateSnapshot,
} from '../utils/procedure-template-versioning.util';

export function isBackwardProcedureTransition(
  fromOrder: number,
  toOrder: number,
): boolean {
  return toOrder <= fromOrder;
}

async function normalizeBackwardTransitions(
  manager: EntityManager,
  templateId: string,
): Promise<void> {
  const [stages, transitions, existingCycles] = await Promise.all([
    manager.find(Stage, { where: { templateId } }),
    manager.find(Transition, { where: { templateId } }),
    manager.find(Cycle, { where: { templateId } }),
  ]);
  const stageOrders = new Map(stages.map((stage) => [stage.id, stage.order]));
  const cycleKeys = new Set(
    existingCycles.map((cycle) => `${cycle.fromStageId}:${cycle.toStageId}`),
  );
  const backwardTransitions = transitions.filter((transition) => {
    const fromOrder = stageOrders.get(transition.fromStageId);
    const toOrder = stageOrders.get(transition.toStageId);
    return (
      fromOrder !== undefined &&
      toOrder !== undefined &&
      isBackwardProcedureTransition(fromOrder, toOrder)
    );
  });

  for (const transition of backwardTransitions) {
    const key = `${transition.fromStageId}:${transition.toStageId}`;
    if (!cycleKeys.has(key)) {
      await manager.save(
        manager.create(Cycle, {
          templateId,
          fromStageId: transition.fromStageId,
          toStageId: transition.toStageId,
          label: transition.label,
          condition: transition.condition,
          maxLoops: 1,
        }),
      );
      cycleKeys.add(key);
    }
    await manager.remove(transition);
  }
}

function assertPublishableGraph(template: ProcedureTemplate): void {
  const stages = template.stages ?? [];
  const transitions = template.transitions ?? [];
  if (stages.length === 0) {
    throw new Error(`Template sans étape : ${template.name}`);
  }

  const ids = new Set(stages.map((stage) => stage.id));
  const incoming = new Map(stages.map((stage) => [stage.id, 0]));
  const outgoing = new Map(stages.map((stage) => [stage.id, [] as string[]]));
  for (const transition of transitions) {
    if (
      !ids.has(transition.fromStageId) ||
      !ids.has(transition.toStageId) ||
      transition.fromStageId === transition.toStageId
    ) {
      throw new Error(`Transition invalide dans ${template.name}`);
    }
    incoming.set(
      transition.toStageId,
      (incoming.get(transition.toStageId) ?? 0) + 1,
    );
    outgoing.get(transition.fromStageId)!.push(transition.toStageId);
  }

  const starts = stages.filter((stage) => incoming.get(stage.id) === 0);
  const ends = stages.filter(
    (stage) => (outgoing.get(stage.id)?.length ?? 0) === 0,
  );
  if (starts.length !== 1 || ends.length === 0) {
    throw new Error(`Graphe non publiable : ${template.name}`);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (stageId: string): void => {
    if (visiting.has(stageId)) {
      throw new Error(
        `Cycle ordinaire non borné dans le template ${template.name}`,
      );
    }
    if (visited.has(stageId)) return;
    visiting.add(stageId);
    for (const target of outgoing.get(stageId) ?? []) walk(target);
    visiting.delete(stageId);
    visited.add(stageId);
  };
  walk(starts[0].id);
  if (visited.size !== stages.length) {
    throw new Error(`Étape inaccessible dans le template ${template.name}`);
  }
}

async function loadGraph(
  manager: EntityManager,
  templateId: string,
): Promise<ProcedureTemplate> {
  return manager.findOneOrFail(ProcedureTemplate, {
    where: { id: templateId },
    relations: [
      'stages',
      'stages.subStages',
      'stages.config',
      'transitions',
      'cycles',
    ],
  });
}

export async function publishSeededProcedureTemplate(
  manager: EntityManager,
  templateId: string,
): Promise<ProcedureTemplate> {
  const locked = await manager.findOneOrFail(ProcedureTemplate, {
    where: { id: templateId },
    lock: { mode: 'pessimistic_write' },
  });
  if (locked.lifecycleStatus === ProcedureTemplateLifecycle.PUBLISHED) {
    return loadGraph(manager, templateId);
  }
  if (locked.lifecycleStatus !== ProcedureTemplateLifecycle.DRAFT) {
    throw new Error(
      `Le template ${locked.name} n'est ni publiable ni utilisable (${locked.lifecycleStatus})`,
    );
  }

  await normalizeBackwardTransitions(manager, templateId);
  const graph = await loadGraph(manager, templateId);
  assertPublishableGraph(graph);
  const snapshot = buildProcedureTemplateSnapshot(graph);
  locked.contentHash = hashProcedureTemplateSnapshot(snapshot);
  locked.lifecycleStatus = ProcedureTemplateLifecycle.PUBLISHED;
  locked.publishedAt = new Date();
  locked.retiredAt = null;
  await manager.save(locked);
  return loadGraph(manager, templateId);
}
