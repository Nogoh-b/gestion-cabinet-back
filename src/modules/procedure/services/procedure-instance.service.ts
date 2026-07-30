// services/procedure-instance.service.ts
import { Repository, DataSource, QueryRunner, IsNull, EntityManager, In } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { CreateProcedureInstanceDto, UpdateProcedureInstanceDto } from '../dto/create-procedure-instance.dto';
import { Cycle } from '../entities/cycle.entity';
import { EventType, InstanceStatus, TransitionType } from '../entities/enums/instance-status.enum';
import { HistoryEntry } from '../entities/history-entry.entity';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { StageVisit } from '../entities/stage-visit.entity';
import { Stage } from '../entities/stage.entity';
import { SubStageVisit } from '../entities/sub-stage-visit.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import { MappedInstance } from '../entities/type/instance-status.enum';
import { HistoryService } from './history.service';
import { InstanceMapperService } from './instance-sub-stage.service';
import { ProcedureTemplateService } from './procedure-template.service';
import { WorkflowService } from './workflow.service';
import { ProcedureTemplateLifecycle } from '../entities/procedure-template.entity';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { Decision } from '../entities/decision.entity';
import { AuditService } from 'src/core/audit/audit.service';
import { ProcedureRequirementService } from './procedure-requirement.service';
import { ProcedureRequirementType } from '../interfaces/procedure-requirement.interface';



@Injectable()
export class ProcedureInstanceService {
  constructor(
    @InjectRepository(ProcedureInstance)
    private instanceRepository: Repository<ProcedureInstance>,
    @InjectRepository(Stage)
    private stageRepository: Repository<Stage>,
    @InjectRepository(SubStage)
    private subStageRepository: Repository<SubStage>,
    @InjectRepository(Transition)
    private transitionRepository: Repository<Transition>,
    @InjectRepository(Cycle)
    private cycleRepository: Repository<Cycle>,
    private templateService: ProcedureTemplateService,
    private workflowService: WorkflowService,
    private historyService: HistoryService,
    private dataSource: DataSource,
    private instanceMapper: InstanceMapperService,
    @InjectRepository(StageVisit)
    private stageVisitRepository: Repository<StageVisit>,
    @InjectRepository(SubStageVisit)
    private subStageVisitRepository: Repository<SubStageVisit>,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
    private readonly requirementService: ProcedureRequirementService,

  ) {}

  private secureProcedureCommandsOnly(): boolean {
    return true;
  }

  async create(
    dto: CreateProcedureInstanceDto,
    userId: string,
    entityManager?: EntityManager,
  ): Promise<ProcedureInstance> {
    const template = await this.templateService.findOne(dto.templateId);

    if (
      template.lifecycleStatus !== ProcedureTemplateLifecycle.PUBLISHED ||
      !template.contentHash
    ) {
      throw new BadRequestException(
        'Une instance doit être créée depuis une version publiée du template',
      );
    }
    if (!template.stages || template.stages.length === 0) {
      throw new BadRequestException('Le template ne contient aucune étape');
    }
    const snapshot = this.templateService.buildSnapshot(template);
    const snapshotHash = this.templateService.hashSnapshot(snapshot);
    if (snapshotHash !== template.contentHash) {
      throw new BadRequestException(
        "L'empreinte de la version publiée ne correspond plus à son contenu",
      );
    }

    // Le template est l'unique source du parcours procédural. La création d'une
    // instance ne doit donc jamais créer ou modifier une entité Stage.
    const firstStage = [...template.stages].sort((a, b) => a.order - b.order)[0];
    if (entityManager) {
      return this.createWithManager(
        entityManager,
        dto,
        userId,
        firstStage.id,
        template.familyId,
        snapshot,
        snapshotHash,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const instance = await this.createWithManager(
        queryRunner.manager,
        dto,
        userId,
        firstStage.id,
        template.familyId,
        snapshot,
        snapshotHash,
      );

      await queryRunner.commitTransaction();
      return this.findOne(instance.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async createWithManager(
    manager: EntityManager,
    dto: CreateProcedureInstanceDto,
    userId: string,
    firstStageId: string,
    templateFamilyId: string,
    templateSnapshot: Record<string, any>,
    templateSnapshotHash: string,
  ): Promise<ProcedureInstance> {
    const instance = manager.create(ProcedureInstance, {
      templateId: dto.templateId,
      templateFamilyId,
      templateVersionId: dto.templateId,
      templateSnapshot,
      templateSnapshotHash,
      title: dto.title,
      status: InstanceStatus.ACTIVE,
      currentStageId: firstStageId,
    });
    await manager.save(instance);

    const firstVisit = manager.create(StageVisit, {
      instanceId: instance.id,
      stageId: firstStageId,
      visitNumber: 1,
      enteredAt: new Date(),
      subStageVisits: [],
    });
    await manager.save(firstVisit);

    const historyEntry = manager.create(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_ENTER,
      stageId: firstStageId,
      userId,
      metadata: {
        message: 'Instance créée depuis la première étape du template',
        stageVisitId: firstVisit.id,
      },
    });
    await manager.save(historyEntry);
    await this.auditService.append(manager, {
      actorId: userId,
      action: 'procedure.instance.created',
      resourceType: 'ProcedureInstance',
      resourceId: instance.id,
      afterState: {
        templateFamilyId,
        templateVersionId: dto.templateId,
        currentStageId: firstStageId,
        status: InstanceStatus.ACTIVE,
        snapshotHash: templateSnapshotHash,
      },
    });
    return instance;
  }

// services/procedure-instance.service.ts

/**
 * Compléter une sous-étape (version sans transaction)
 */
async completeSubStage(
  instanceId: string,
  subStageId: string,
  userId: string,
  notes?: string,
  metadata?: Record<string, any>,
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    return this.completeSubStageTransaction(
      instanceId,
      subStageId,
      userId,
      notes,
      metadata,
    );
  }

  // Branche historique inaccessible, conservée seulement jusqu'au retrait
  // mécanique des anciens helpers internes.
  const skipAutoTransitions = false;
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const instance = await this.findOne(instanceId);
    let currentStageVisit = await this.getCurrentStageVisitEntity(instance);

    // 🔥 On autorise la complétion de n'importe quelle sous-étape en cours
    // (plusieurs sous-étapes peuvent être démarrées simultanément).

    // Trouver ou créer SubStageVisit
    let subStageVisit = await this.subStageVisitRepository.findOne({
      where: {
        stageVisitId: currentStageVisit.id,
        subStageId: subStageId,
      },
    });

    if (!subStageVisit) {
      subStageVisit = this.subStageVisitRepository.create({
        stageVisitId: currentStageVisit.id,
        subStageId: subStageId,
        isCompleted: true,
        startedAt: new Date(),
        completedAt: new Date(),
        metadata: { notes, completedBy: userId },
      });
    } else {
      subStageVisit!.isCompleted = true;
      subStageVisit!.completedAt = new Date();
      subStageVisit!.metadata = { ...subStageVisit!.metadata, notes, lastCompletedBy: userId };
    }

    await queryRunner.manager.save(subStageVisit);

    // 🔥 Si on terminait la "current" sous-étape, repointer vers une autre
    // sous-étape encore en cours (s'il en reste), sinon nettoyer.
    if (currentStageVisit.currentSubStageVisitId === subStageVisit!.id) {
      const anotherOngoing = await queryRunner.manager.findOne(SubStageVisit, {
        where: { stageVisitId: currentStageVisit.id, isCompleted: false },
        order: { startedAt: 'DESC' },
      });
      await queryRunner.manager.update(StageVisit, currentStageVisit.id, {
        currentSubStageVisitId: anotherOngoing?.id ?? null,
      });
    }

    await queryRunner.manager.save(
      queryRunner.manager.create(HistoryEntry, {
        instanceId,
        eventType: EventType.SUBSTAGE_COMPLETED,
        stageId: instance.currentStageId,
        userId,
        metadata: {
          subStageId,
          visitNumber: currentStageVisit.visitNumber,
          subStageVisitId: subStageVisit!.id,
          notes,
        },
      }),
    );
    if (!skipAutoTransitions) {
      await this.checkAndTriggerAutomaticTransitions(
        instanceId,
        userId,
        queryRunner,
      );
    }
    await queryRunner.commitTransaction();

    return this.findOne(instanceId);

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

private async completeSubStageTransaction(
  instanceId: string,
  subStageId: string,
  userId: string,
  notes?: string,
  metadata?: Record<string, any>,
): Promise<ProcedureInstance> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('SERIALIZABLE');
  try {
    const instance = await queryRunner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: [
        'template',
        'template.stages',
        'template.stages.subStages',
      ],
      lock: { mode: 'pessimistic_write' },
    });
    if (!instance) {
      throw new NotFoundException('Instance procédurale non trouvée');
    }
    if (instance.status !== InstanceStatus.ACTIVE) {
      throw new BadRequestException(
        `Seule une instance ACTIVE peut être modifiée (${instance.status})`,
      );
    }
    const currentStageVisit = await queryRunner.manager.findOne(StageVisit, {
      where: { instanceId, exitedAt: IsNull() },
      relations: ['subStageVisits'],
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !currentStageVisit ||
      currentStageVisit.stageId !== instance.currentStageId
    ) {
      throw new BadRequestException(
        "L'instance ne possède pas une visite active cohérente",
      );
    }
    const currentStage = instance.template.stages.find(
      (stage) => stage.id === instance.currentStageId,
    );
    const subStage = currentStage?.subStages?.find(
      (item) => item.id === subStageId,
    );
    if (!currentStage || !subStage) {
      throw new BadRequestException(
        "La sous-étape n'appartient pas à l'étape courante de cette version",
      );
    }

    let subStageVisit = await queryRunner.manager.findOne(SubStageVisit, {
      where: {
        stageVisitId: currentStageVisit.id,
        subStageId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (subStageVisit?.isCompleted) {
      await queryRunner.commitTransaction();
      return this.findOne(instanceId);
    }

    const safeMetadata =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...metadata }
        : {};
    delete safeMetadata.approvals;
    delete safeMetadata.completedBy;
    delete safeMetadata.completedAt;
    if (!subStageVisit) {
      subStageVisit = await queryRunner.manager.save(
        queryRunner.manager.create(SubStageVisit, {
          stageVisitId: currentStageVisit.id,
          subStageId,
          isCompleted: false,
          startedAt: new Date(),
          completedAt: null,
          metadata: {
            ...safeMetadata,
            ...(notes ? { notes } : {}),
            startedBy: userId,
          },
        }),
      );
    } else {
      subStageVisit.metadata = {
        ...(subStageVisit.metadata ?? {}),
        ...safeMetadata,
        ...(notes ? { notes } : {}),
      };
      subStageVisit = await queryRunner.manager.save(subStageVisit);
    }

    const requirementResults = await this.requirementService.evaluate(
      queryRunner.manager,
      instanceId,
      subStageVisit,
      subStage.requirements ?? [],
    );
    const blockingRequirements = requirementResults.filter(
      (result) => !result.satisfied,
    );
    if (blockingRequirements.length > 0) {
      throw new BadRequestException({
        message: 'Exigences de la sous-étape non satisfaites',
        subStageId,
        requirements: blockingRequirements,
      });
    }

    subStageVisit.isCompleted = true;
    subStageVisit.completedAt = new Date();
    subStageVisit.metadata = {
      ...(subStageVisit.metadata ?? {}),
      completedBy: userId,
      completedAt: subStageVisit.completedAt.toISOString(),
    };
    await queryRunner.manager.save(subStageVisit);

    if (currentStageVisit.currentSubStageVisitId === subStageVisit!.id) {
      const anotherOngoing = await queryRunner.manager.findOne(SubStageVisit, {
        where: { stageVisitId: currentStageVisit.id, isCompleted: false },
        order: { startedAt: 'DESC' },
      });
      await queryRunner.manager.update(StageVisit, currentStageVisit.id, {
        currentSubStageVisitId: anotherOngoing?.id ?? null,
      });
    }
    await queryRunner.manager.save(
      queryRunner.manager.create(HistoryEntry, {
        instanceId,
        eventType: EventType.SUBSTAGE_COMPLETED,
        stageId: instance.currentStageId,
        userId,
        metadata: {
          subStageId,
          visitNumber: currentStageVisit.visitNumber,
          subStageVisitId: subStageVisit!.id,
          notes,
          requirements: requirementResults,
        },
      }),
    );
    await this.outboxService.enqueue(queryRunner.manager, {
      eventType: 'procedure.sub-stage.completed',
      aggregateType: 'ProcedureInstance',
      aggregateId: instanceId,
      idempotencyKey: `procedure-sub-stage-completed:${subStageVisit.id}`,
      payload: {
        instanceId,
        stageId: currentStage.id,
        subStageId,
        subStageVisitId: subStageVisit.id,
        actorId: userId,
      },
    });
    await this.auditService.append(queryRunner.manager, {
      actorId: userId,
      action: 'procedure.sub-stage.completed',
      resourceType: 'SubStageVisit',
      resourceId: subStageVisit.id,
      afterState: {
        instanceId,
        stageId: currentStage.id,
        subStageId,
        completedAt: subStageVisit.completedAt,
      },
    });
    await this.checkAndTriggerAutomaticTransitions(
      instanceId,
      userId,
      queryRunner,
    );
    await queryRunner.commitTransaction();
    return this.findOne(instanceId);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/**
 * Déclencher les transitions automatiques (version simple sans transaction)
 */
async approveSubStageRequirement(
  instanceId: string,
  subStageId: string,
  requirementId: string,
  userId: string,
  actorRole: string | undefined,
  comment?: string,
): Promise<ProcedureInstance> {
  await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
    const instance = await manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: [
        'template',
        'template.stages',
        'template.stages.subStages',
      ],
      lock: { mode: 'pessimistic_write' },
    });
    if (!instance || instance.status !== InstanceStatus.ACTIVE) {
      throw new BadRequestException(
        'Une approbation exige une instance ACTIVE',
      );
    }
    const stage = instance.template.stages.find(
      (item) => item.id === instance.currentStageId,
    );
    const subStage = stage?.subStages.find((item) => item.id === subStageId);
    const requirement = subStage?.requirements?.find(
      (item) => item.id === requirementId,
    );
    if (
      !stage ||
      !subStage ||
      !requirement ||
      requirement.type !== ProcedureRequirementType.APPROVAL
    ) {
      throw new NotFoundException(
        "L'exigence d'approbation n'appartient pas à la sous-étape courante",
      );
    }
    if (
      requirement.approvalRole &&
      requirement.approvalRole !== actorRole
    ) {
      throw new ForbiddenException(
        `Cette approbation exige le rôle ${requirement.approvalRole}`,
      );
    }
    const stageVisit = await manager.findOne(StageVisit, {
      where: { instanceId, stageId: stage.id, exitedAt: IsNull() },
      relations: ['subStageVisits'],
      lock: { mode: 'pessimistic_write' },
    });
    if (!stageVisit) {
      throw new BadRequestException(
        "L'instance ne possède pas de visite active cohérente",
      );
    }
    let subStageVisit = await manager.findOne(SubStageVisit, {
      where: { stageVisitId: stageVisit.id, subStageId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!subStageVisit) {
      subStageVisit = await manager.save(
        manager.create(SubStageVisit, {
          stageVisitId: stageVisit.id,
          subStageId,
          isCompleted: false,
          startedAt: new Date(),
          completedAt: null,
          metadata: { startedBy: userId },
        }),
      );
    }
    const approvals = Array.isArray(subStageVisit.metadata?.approvals)
      ? [...subStageVisit.metadata.approvals]
      : [];
    if (
      approvals.some(
        (approval: any) =>
          approval.requirementId === requirementId &&
          String(approval.actorId) === String(userId),
      )
    ) {
      return;
    }
    const approvedAt = new Date().toISOString();
    approvals.push({
      requirementId,
      actorId: userId,
      role: actorRole ?? null,
      approved: true,
      approvedAt,
      comment: comment?.trim() || null,
    });
    subStageVisit.metadata = {
      ...(subStageVisit.metadata ?? {}),
      approvals,
    };
    await manager.save(subStageVisit);
    await manager.save(
      manager.create(HistoryEntry, {
        instanceId,
        eventType: EventType.USER_ACTION,
        stageId: stage.id,
        userId,
        metadata: {
          action: 'SUB_STAGE_REQUIREMENT_APPROVED',
          subStageId,
          requirementId,
          subStageVisitId: subStageVisit.id,
          comment: comment?.trim() || null,
        },
      }),
    );
    await this.outboxService.enqueue(manager, {
      eventType: 'procedure.requirement.approved',
      aggregateType: 'ProcedureInstance',
      aggregateId: instanceId,
      idempotencyKey:
        `procedure-requirement-approved:${subStageVisit.id}:` +
        `${requirementId}:${userId}`,
      payload: {
        instanceId,
        subStageId,
        requirementId,
        subStageVisitId: subStageVisit.id,
        actorId: userId,
      },
    });
    await this.auditService.append(manager, {
      actorId: userId,
      action: 'procedure.requirement.approved',
      resourceType: 'SubStageVisit',
      resourceId: subStageVisit.id,
      afterState: {
        instanceId,
        subStageId,
        requirementId,
        approvedAt,
      },
      justification: comment?.trim() || null,
    });
  });
  return this.findOne(instanceId);
}

private async triggerAutomaticTransitionsSimple(
  instance: ProcedureInstance,
  userId: string
): Promise<void> {
  const automaticTransitions = await this.transitionRepository.find({
    where: {
      fromStageId: instance.currentStageId,
      type: TransitionType.AUTOMATIC,
    },
  });
  console.log('automaticTransitions ', automaticTransitions)
  
  for (const transition of automaticTransitions) {

    // Évaluer la condition si présente
    let shouldTrigger = true;
    if (transition.triggerCondition) {
      const context = {
        instance: {
          data: {},
          completedSubStages: instance.completedSubStages,
        },
      };
      shouldTrigger = await this.workflowService.evaluateCondition(
        transition.triggerCondition, 
        context
      );
    }
    console.log('doit effectue transaction automatique ', automaticTransitions)
    
    if (shouldTrigger) {
      // Exécuter la transition
      await this.executeTransitionSimple(instance, transition, userId);
    }
  }
}

/**
 * Exécuter une transition (version simple)
 */
private async executeTransitionSimple(
  instance: ProcedureInstance,
  transition: any,
  userId: string
): Promise<void> {
  // Enregistrer la décision
  await this.historyService.log(
    instance.id,
    EventType.DECISION,
    transition.fromStageId,
    userId,
    { transitionId: transition.id, type: 'automatic', comment: 'Transition automatique' }
  );
  
  // Quitter le stage courant
  await this.historyService.log(
    instance.id,
    EventType.STAGE_EXIT,
    transition.fromStageId,
    userId,
    { transitionId: transition.id, type: 'automatic' }
  );
  
  // Entrer dans le nouveau stage
  await this.instanceRepository.update(instance.id, {
    currentStageId: transition.toStageId,
  });
  
  await this.historyService.log(
    instance.id,
    EventType.STAGE_ENTER,
    transition.toStageId,
    userId,
    { transitionId: transition.id }
  );
}


  
  /**
   * Appliquer un cycle (retour arrière)
   */
 async applyCycle(
  instanceId: string, 
  cycleId: string, 
  userId: string
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    return this.applyCycleTransaction(instanceId, cycleId, userId);
  }

  // Branche historique inaccessible pendant la reprise des anciens appels.
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED'); // Niveau d'isolation plus bas

    // 1. Récupérer et verrouiller UNIQUEMENT l'instance
    const instance = await queryRunner.manager
      .createQueryBuilder(ProcedureInstance, 'instance')
      .setLock('pessimistic_write')
      .where('instance.id = :id', { id: instanceId })
      .getOne();

    if (!instance) {
      throw new NotFoundException(`Instance ${instanceId} not found`);
    }

    // 2. Récupérer le cycle (hors transaction ou en lecture seule)
    const cycle = await this.cycleRepository.findOne({
      where: { id: cycleId },
      relations: ['fromStage', 'toStage'],
    });
    
    if (!cycle) {
      throw new NotFoundException('Cycle not found');
    }
    
    if (cycle.fromStageId !== instance.currentStageId) {
      throw new BadRequestException('Cycle not available from current stage');
    }
    
    // 3. Vérifier le nombre maximum de retours
    const usedCount = (instance.cycleUsageCount?.[cycleId] || 0);
    if (cycle.maxLoops && usedCount >= cycle.maxLoops) {
      throw new BadRequestException(
        `Maximum loop count (${cycle.maxLoops}) reached for this cycle`
      );
    }
    
    // 4. Évaluer la condition (hors transaction si possible)
    if (cycle.condition) {
      const context = {
        instance: { 
          data: {}, 
          completedSubStages: instance.completedSubStages 
        },
      };
      const shouldApply = await this.workflowService.evaluateCondition(
        cycle.condition, 
        context
      );
      if (!shouldApply) {
        throw new BadRequestException('Cycle condition not met');
      }
    }
    
    // 5. Préparer les données de mise à jour
    const updatedCycleUsageCount = {
      ...(instance.cycleUsageCount || {}),
      [cycleId]: usedCount + 1,
    };
    
    // 6. Mettre à jour l'instance en une seule requête
    await queryRunner.manager
      .createQueryBuilder()
      .update(ProcedureInstance)
      .set({
        currentStageId: cycle.toStageId,
        cycleUsageCount: updatedCycleUsageCount,
        updated_at: new Date(),
      })
      .where('id = :id', { id: instanceId })
      .execute();

    // 7. Enregistrer l'historique de manière asynchrone (dans une même transaction)
    const historyEntries = [
      {
        id: this.generateUuid(),
        instanceId: instance.id,
        eventType: EventType.STAGE_EXIT,
        stageId: instance.currentStageId,
        subStageId: null,
        userId: userId || 'system',
        metadata: JSON.stringify({
          cycleId,
          reason: 'cycle_applied',
          label: cycle.label
        }),
        created_at: new Date(),
      },
      {
        id: this.generateUuid(),
        instanceId: instance.id,
        eventType: EventType.STAGE_ENTER,
        stageId: cycle.toStageId,
        subStageId: null,
        userId: userId || 'system',
        metadata: JSON.stringify({
          cycleId,
          fromStage: cycle.fromStageId,
          label: cycle.label
        }),
        created_at: new Date(),
      },
      {
        id: this.generateUuid(),
        instanceId: instance.id,
        eventType: EventType.CYCLE_APPLIED,
        stageId: cycle.toStageId,
        subStageId: null,
        userId: userId || 'system',
        metadata: JSON.stringify({
          cycleId,
          fromStageId: cycle.fromStageId,
          toStageId: cycle.toStageId,
          label: cycle.label
        }),
        created_at: new Date(),
      },
    ];

    // Insertion en masse (une seule requête)
    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('history_entries')
      .values(historyEntries)
      .execute();

    await queryRunner.commitTransaction();

    // Retourner l'instance mise à jour (sans recharger avec findOne pour éviter une nouvelle requête)
    instance.currentStageId = cycle.toStageId;
    instance.cycleUsageCount = updatedCycleUsageCount;
    return instance;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    
    if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
      throw new BadRequestException(
        'Trop de requêtes simultanées, veuillez réessayer dans quelques instants'
      );
    }
    
    throw error;
  } finally {
    await queryRunner.release();
  }
}

private async getCycleUsageCounts(
  manager: EntityManager,
  instanceId: string,
  cycleIds?: string[],
): Promise<Record<string, number>> {
  if (cycleIds?.length === 0) return {};
  const query = manager
    .getRepository(HistoryEntry)
    .createQueryBuilder('history')
    .select('history.cycleId', 'cycleId')
    .addSelect('COUNT(history.id)', 'usageCount')
    .where('history.instanceId = :instanceId', { instanceId })
    .andWhere('history.eventType = :eventType', {
      eventType: EventType.CYCLE_APPLIED,
    })
    .andWhere('history.cycleId IS NOT NULL');
  if (cycleIds) {
    query.andWhere('history.cycleId IN (:...cycleIds)', { cycleIds });
  }
  const rows = await query
    .groupBy('history.cycleId')
    .getRawMany<{ cycleId: string; usageCount: string }>();
  return Object.fromEntries(
    rows.map((row) => [row.cycleId, Number(row.usageCount)]),
  );
}

private async applyCycleTransaction(
  instanceId: string,
  cycleId: string,
  userId: string,
): Promise<ProcedureInstance> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('SERIALIZABLE');
  try {
    const instance = await queryRunner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: [
        'template',
        'template.stages',
        'template.stages.subStages',
      ],
      lock: { mode: 'pessimistic_write' },
    });
    if (!instance) {
      throw new NotFoundException('Instance procédurale non trouvée');
    }
    if (instance.status !== InstanceStatus.ACTIVE) {
      throw new BadRequestException(
        `Un cycle exige une instance ACTIVE (${instance.status})`,
      );
    }
    const cycle = await queryRunner.manager.findOne(Cycle, {
      where: {
        id: cycleId,
        templateId: instance.templateVersionId,
        fromStageId: instance.currentStageId,
      },
      relations: ['fromStage', 'toStage'],
    });
    if (!cycle) {
      throw new NotFoundException(
        "Le cycle n'appartient pas à la version ou à l'étape courante",
      );
    }
    const usageCounts = await this.getCycleUsageCounts(
      queryRunner.manager,
      instanceId,
      [cycleId],
    );
    const usedCount = usageCounts[cycleId] ?? 0;
    if (!cycle.maxLoops || usedCount >= cycle.maxLoops) {
      throw new BadRequestException(
        `Nombre maximal de boucles atteint (${cycle.maxLoops})`,
      );
    }
    const currentVisit = await queryRunner.manager.findOne(StageVisit, {
      where: { instanceId, exitedAt: IsNull() },
      relations: ['subStageVisits'],
      lock: { mode: 'pessimistic_write' },
    });
    const currentStage = instance.template.stages.find(
      (stage) => stage.id === instance.currentStageId,
    );
    if (
      !currentVisit ||
      !currentStage ||
      currentVisit.stageId !== currentStage.id
    ) {
      throw new BadRequestException(
        "L'instance ne possède pas une visite active cohérente",
      );
    }
    const blockingRequirements =
      await this.requirementService.getStageBlockingRequirements(
        queryRunner.manager,
        instanceId,
        currentStage,
        currentVisit,
      );
    if (blockingRequirements.length > 0) {
      throw new BadRequestException({
        message: 'Exigences procédurales obligatoires non satisfaites',
        requirements: blockingRequirements,
      });
    }
    const conditionSatisfied = await this.workflowService.evaluateCondition(
      cycle.condition,
      {
        instance,
        stage: currentStage,
        stageVisit: currentVisit,
      },
    );
    if (!conditionSatisfied) {
      throw new BadRequestException("La condition du cycle n'est pas satisfaite");
    }

    currentVisit.exitedAt = new Date();
    await queryRunner.manager.save(currentVisit);
    instance.currentStageId = cycle.toStageId;
    await queryRunner.manager.save(instance);
    const visitNumber =
      (await queryRunner.manager.count(StageVisit, {
        where: { instanceId, stageId: cycle.toStageId },
      })) + 1;
    const nextVisit = await queryRunner.manager.save(
      queryRunner.manager.create(StageVisit, {
        instanceId,
        stageId: cycle.toStageId,
        visitNumber,
        enteredAt: new Date(),
        subStageVisits: [],
      }),
    );
    await queryRunner.manager.save([
      queryRunner.manager.create(HistoryEntry, {
        instanceId,
        eventType: EventType.STAGE_EXIT,
        stageId: cycle.fromStageId,
        userId,
        metadata: { cycleId, label: cycle.label },
      }),
      queryRunner.manager.create(HistoryEntry, {
        instanceId,
        eventType: EventType.STAGE_ENTER,
        stageId: cycle.toStageId,
        userId,
        metadata: {
          cycleId,
          label: cycle.label,
          stageVisitId: nextVisit.id,
          visitNumber,
        },
      }),
      queryRunner.manager.create(HistoryEntry, {
        instanceId,
        eventType: EventType.CYCLE_APPLIED,
        stageId: cycle.toStageId,
        cycleId,
        userId,
        metadata: {
          cycleId,
          fromStageId: cycle.fromStageId,
          toStageId: cycle.toStageId,
          usageCount: usedCount + 1,
        },
      }),
    ]);
    await this.outboxService.enqueue(queryRunner.manager, {
      eventType: 'procedure.cycle.applied',
      aggregateType: 'ProcedureInstance',
      aggregateId: instanceId,
      idempotencyKey: `procedure-cycle:${instanceId}:${currentVisit.id}`,
      payload: {
        instanceId,
        cycleId,
        fromStageId: cycle.fromStageId,
        toStageId: cycle.toStageId,
        stageVisitId: nextVisit.id,
        actorId: userId,
      },
    });
    await this.auditService.append(queryRunner.manager, {
      actorId: userId,
      action: 'procedure.cycle.applied',
      resourceType: 'ProcedureInstance',
      resourceId: instanceId,
      beforeState: {
        currentStageId: cycle.fromStageId,
        usageCount: usedCount,
      },
      afterState: {
        currentStageId: cycle.toStageId,
        usageCount: usedCount + 1,
      },
    });
    await queryRunner.commitTransaction();
    return this.findOne(instanceId);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

private generateUuid(): string {
  // Utiliser une fonction UUID de la base de données ou crypto
  return crypto.randomUUID();
}


  

  /**
   * Récupérer les cycles disponibles pour une instance
   */
  async getAvailableCycles(instanceId: string): Promise<Cycle[]> {
    const instance = await this.findOne(instanceId);
    if (instance.status !== InstanceStatus.ACTIVE) return [];
    const currentStageVisit = await this.getCurrentStageVisitEntity(instance);
    const currentStage = instance.template.stages.find(
      (stage) => stage.id === instance.currentStageId,
    );
    if (!currentStage) return [];
    const blockingRequirements =
      await this.requirementService.getStageBlockingRequirements(
        this.dataSource.manager,
        instanceId,
        currentStage,
        currentStageVisit,
      );
    if (blockingRequirements.length > 0) return [];
    
    const cycles = await this.cycleRepository.find({
      where: {
        fromStageId: instance.currentStageId,
        templateId: instance.templateVersionId,
      },
    });
    const usageCounts = await this.getCycleUsageCounts(
      this.dataSource.manager,
      instanceId,
      cycles.map((cycle) => cycle.id),
    );
    
    const available: Cycle[] = [];
    for (const cycle of cycles) {
      // Vérifier le nombre maximum de retours
      const usedCount = usageCounts[cycle.id] ?? 0;
      if (cycle.maxLoops && usedCount >= cycle.maxLoops) {
        continue;
      }
      
      // Vérifier la condition
      if (cycle.condition) {
        const context = {
          instance,
          stage: currentStage,
          stageVisit: currentStageVisit,
        };
        const shouldApply = await this.workflowService.evaluateCondition(
          cycle.condition, 
          context
        );
        if (shouldApply) {
          available.push(cycle);
        }
      } else {
        available.push(cycle);
      }
    }
    
    return available;
  }

  /**
   * Récupérer les transitions disponibles
   */
/**
 * Récupérer les transitions manuelles disponibles
 * Utilise maintenant la visite courante (StageVisit) pour évaluer les conditions
 */
async getAvailableTransitions(instanceId: string): Promise<Transition[]> {
  const instance = await this.findOne(instanceId);
  if (instance.status !== InstanceStatus.ACTIVE) return [];
  const currentStageVisit = await this.getCurrentStageVisitEntity(instance);
  const currentStage = instance.template.stages.find(
    (stage) => stage.id === instance.currentStageId,
  );
  if (!currentStage) return [];
  const blockingRequirements =
    await this.requirementService.getStageBlockingRequirements(
      this.dataSource.manager,
      instanceId,
      currentStage,
      currentStageVisit,
    );
  if (blockingRequirements.length > 0) return [];

  // Récupérer toutes les transitions manuelles depuis l'étape courante
  const transitions = await this.transitionRepository.find({
    where: {
      fromStageId: instance.currentStageId,
      templateId: instance.templateVersionId,
      type: TransitionType.MANUAL,
    },
    relations: ['fromStage', 'toStage'],
  });
  const available: Transition[] = [];

  for (const transition of transitions) {
    let shouldBeAvailable = true;

    // Si la transition a une condition, on l'évalue avec les données de la visite courante
    if (transition.condition) {
      const context = {
        instance: {
          data: {},
          // On passe les sous-étapes complétées de la VISITE COURANTE
          completedSubStages:
            currentStageVisit.subStageVisits
              ?.filter((visit) => visit.isCompleted)
              .map((visit) => visit.subStageId) ?? [],
        },
        stageVisit: {
          visitNumber: currentStageVisit.visitNumber,
          completedSubStages:
            currentStageVisit.subStageVisits
              ?.filter((visit) => visit.isCompleted)
              .map((visit) => visit.subStageId) ?? [],
        },
      };

      shouldBeAvailable = await this.workflowService.evaluateCondition(
        transition.condition,
        context
      );
    }

    if (shouldBeAvailable) {
      available.push(transition);
    }
  }

  return available;
}

  async findAll(filters?: {
    status?: InstanceStatus;
    templateId?: string;
    instanceIds?: string[];
  }): Promise<ProcedureInstance[]> {
    if (filters?.instanceIds && filters.instanceIds.length === 0) {
      return [];
    }
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.templateId) where.templateId = filters.templateId;
    if (filters?.instanceIds) where.id = In(filters.instanceIds);

    return this.instanceRepository.find({
      where,
      relations: ['template', 'currentStage', 'tasks'],
      order: { created_at: 'DESC' },
    });
  }

 /**
   * Récupérer une instance (sans lock)
   */
  async findOne(id: string): Promise<ProcedureInstance> {
      const instance = await this.instanceRepository.findOne({
        where: { id },
        relations: [
          'template',
          'template.stages',
          'template.transitions',
          'template.stages.subStages',
          'template.stages.config',
          'currentStage',
          // 'currentStage.subStages',
          // 'decisions',
          // 'tasks',
          'stageVisits',
          'stageVisits.subStageVisits',
        ],
      });

      if (!instance) throw new NotFoundException(`Instance with ID ${id} not found`);

      return instance;
    }

  async findOneMapped(id: string): Promise<MappedInstance> {
      const instance = await this.findOne(id);
      const currentVisit = await this.getCurrentStageVisitEntity(instance);

      return await this.instanceMapper.mapInstanceWithCurrentTemplate(
        instance, 
        instance.template, 
        currentVisit
      );
  }


  private async update(id: string, dto: UpdateProcedureInstanceDto): Promise<ProcedureInstance> {
    if (this.secureProcedureCommandsOnly()) {
      throw new ForbiddenException(
        "La modification générique d'une instance procédurale est désactivée",
      );
    }
    // Mise à jour directe sans find
    const updateResult = await this.instanceRepository.update(id, {
      // Mappez les champs du DTO vers l'entité
      ...dto,
      updated_at: new Date(),
      // Autres champs à mettre à jour
    });

    if (updateResult.affected === 0) {
      throw new NotFoundException(`ProcedureInstance avec l'ID ${id} non trouvée`);
    }

    // Logger l'action (sans avoir l'instance complète)
    // await this.historyService.log(
    //   id, // ou instance.id si vous avez besoin d'autres propriétés
    //   EventType.DECISION,
    //   dto.currentStageId, // ou récupérer depuis le DTO
    //   userId,
    //   { status: dto.status, action: 'status_updated' },
    // );

    // Retourner l'entité mise à jour (optionnel)
    return this.findOne(id);
  }

  async getWorkflowStatus(id: string): Promise<any> {
    const instance = await this.findOne(id);
    const availableTransitions = await this.getAvailableTransitions(id);
    const availableCycles = await this.getAvailableCycles(id);
    const currentVisit = await this.getCurrentStageVisitEntity(instance);
    const currentStage = instance.template.stages.find(
      (stage) => stage.id === instance.currentStageId,
    );
    if (!currentStage) {
      throw new BadRequestException(
        "L'étape courante n'appartient pas à la version du template",
      );
    }
    const blockingRequirements =
      await this.requirementService.getStageBlockingRequirements(
        this.dataSource.manager,
        instance.id,
        currentStage,
        currentVisit,
      );

    const mapped = await this.instanceMapper.mapInstanceWithCurrentTemplate(instance, instance.template, currentVisit);
    const completedSubStageIds = instance.completedSubStageIds;
    const cycleUsageCounts = await this.getCycleUsageCounts(
      this.dataSource.manager,
      instance.id,
    );

    return {
      procedureSummary: {
        instance_id: instance.id,
        template_id: instance.templateId,
        // Temporaire jusqu'à la migration des versions immuables : l'identité
        // de la famille et de la version coïncident.
        template_version_id: instance.templateVersionId,
        template_name: instance.template.name,
        instance_status: instance.status,
        current_stage_id: instance.currentStageId ?? null,
        current_stage_name: instance.currentStage?.name ?? null,
        current_stage_order: instance.currentStage?.order ?? null,
        progress_percent: instance.progressPercentage,
        blocking_requirements: blockingRequirements,
      },
      instance: {   
        ...mapped.instance,
        currentStage: mapped.currentStage,  // Remplacer par le stage mappé
        completedSubStageIds,
        // Adaptateur de lecture temporaire : cette valeur n'est jamais
        // persistée et provient exclusivement des visites.
        completedSubStages: completedSubStageIds,
        },
      currentVisitNumber: currentVisit.visitNumber,
      stages: mapped.stages,
      currentVisit: currentVisit,
      currentStage: mapped.currentStage,
      progress: mapped.progress,
      availableTransitions,
      availableCycles,
      completedSubStageIds,
      completedSubStages: completedSubStageIds,
      cycleUsageCounts,
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
      isOnLastStageAdvanced: instance.isOnLastStageAdvanced,
    //   history: instance.history,
      tasks: instance.tasks,
    };
  }

  async getStageVisitHistory(instanceId: string): Promise<StageVisit[]> {
    const instance = await this.findOne(instanceId);
    const stageVisits =  await this.stageVisitRepository.find({
      where: { instanceId: instance.id },
      relations: [
        'stage',
        // Relations au niveau de la SOUS-étape
        'subStageVisits', 'subStageVisits.subStage',
        'subStageVisits.documents', 'subStageVisits.diligences',
        'subStageVisits.audiences', 'subStageVisits.factures',
        // Relations au niveau de l'ÉTAPE (liées directement, sans sous-étape)
        'factures', 'diligences', 'audiences', 'documents',
      ],
      order: { enteredAt: 'ASC' },
    });
    return stageVisits;//.sort((a, b) => a.visitNumber - b.visitNumber);
  }




  /**
  * Démarrer une sous-étape (version moderne avec SubStageVisit)
  * ⚠️ Ne permet qu'une seule sous-étape en cours à la fois
  */
async startSubStage(
  instanceId: string,
  subStageId: string,
  userId: string,
  notes?: string,
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    return this.startSubStageTransaction(
      instanceId,
      subStageId,
      userId,
      notes,
    );
  }

  // Branche historique inaccessible pendant la reprise des anciens appels.
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const instance = await this.findOne(instanceId);
    let currentStageVisit = await this.getCurrentStageVisitEntity(instance);

    // 🔥 Plusieurs sous-étapes peuvent être en cours simultanément.
    // On ne bloque plus si une autre sous-étape est en cours — on garde
    // simplement `currentSubStageVisitId` comme pointeur vers la dernière
    // démarrée (pour la rétrocompatibilité avec le code existant).

    // Vérifier si la sous-étape n'est pas déjà complétée
    const existingSubStageVisit = await queryRunner.manager.findOne(SubStageVisit, {
      where: {
        stageVisitId: currentStageVisit.id,
        subStageId: subStageId,
      },
    });

    if (existingSubStageVisit?.isCompleted) {
      throw new BadRequestException(`Cette sous-étape a déjà été complétée.`);
    }

    // Créer ou mettre à jour SubStageVisit
    let subStageVisit = existingSubStageVisit;
    
    if (!subStageVisit) {
      subStageVisit = this.subStageVisitRepository.create({
        stageVisitId: currentStageVisit.id,
        subStageId: subStageId,
        isCompleted: false,
        startedAt: new Date(),
        metadata: {
          notes: notes || '',
          startedBy: userId,
        },
      });
      subStageVisit = await queryRunner.manager.save(subStageVisit);
    } else {
      subStageVisit.startedAt = new Date();
      subStageVisit.metadata = {
        ...subStageVisit.metadata,
        notes: notes || subStageVisit.metadata?.notes,
        restartedBy: userId,
      };
      await queryRunner.manager.save(subStageVisit);
    }

    // 🔥 Mettre à jour le champ currentSubStageVisitId dans StageVisit
    await queryRunner.manager.update(StageVisit, currentStageVisit.id, {
      currentSubStageVisitId: subStageVisit.id,
    });

    // Rafraîchir currentStageVisit
    const refreshedVisit = await queryRunner.manager.findOne(StageVisit, {
      where: { id: currentStageVisit.id },
      relations: ['currentSubStageVisit'],
    });
    if (!refreshedVisit) {
      throw new Error('StageVisit not found after refresh');
    }
    currentStageVisit = refreshedVisit;

    await queryRunner.commitTransaction();

    await this.historyService.log(
      instanceId,
      EventType.SUBSTAGE_STARTED,
      instance.currentStageId,
      userId,
      { 
        subStageId, 
        visitNumber: currentStageVisit.visitNumber,
        subStageVisitId: subStageVisit.id,
        stageVisitId: currentStageVisit.id,
      }
    );

    return this.findOne(instanceId);
    
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}


  /**
   * Ajouter un document à une sous-étape
   */
  private async startSubStageTransaction(
    instanceId: string,
    subStageId: string,
    userId: string,
    notes?: string,
  ): Promise<ProcedureInstance> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');
    try {
      const instance = await queryRunner.manager.findOne(ProcedureInstance, {
        where: { id: instanceId },
        relations: [
          'template',
          'template.stages',
          'template.stages.subStages',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance || instance.status !== InstanceStatus.ACTIVE) {
        throw new BadRequestException(
          'Le démarrage exige une instance procédurale ACTIVE',
        );
      }
      const stage = instance.template.stages.find(
        (item) => item.id === instance.currentStageId,
      );
      const subStage = stage?.subStages.find((item) => item.id === subStageId);
      if (!stage || !subStage) {
        throw new BadRequestException(
          "La sous-étape n'appartient pas à l'étape courante de cette version",
        );
      }
      const stageVisit = await queryRunner.manager.findOne(StageVisit, {
        where: { instanceId, stageId: stage.id, exitedAt: IsNull() },
        relations: ['subStageVisits'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!stageVisit) {
        throw new BadRequestException(
          "L'instance ne possède pas une visite active cohérente",
        );
      }
      const existing = await queryRunner.manager.findOne(SubStageVisit, {
        where: { stageVisitId: stageVisit.id, subStageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing?.isCompleted) {
        throw new BadRequestException('Cette sous-étape est déjà terminée');
      }
      if (existing) {
        await queryRunner.commitTransaction();
        return this.findOne(instanceId);
      }
      const subStageVisit = await queryRunner.manager.save(
        queryRunner.manager.create(SubStageVisit, {
          stageVisitId: stageVisit.id,
          subStageId,
          isCompleted: false,
          startedAt: new Date(),
          completedAt: null,
          metadata: {
            ...(notes ? { notes } : {}),
            startedBy: userId,
          },
        }),
      );
      stageVisit.currentSubStageVisitId = subStageVisit.id;
      await queryRunner.manager.save(stageVisit);
      await queryRunner.manager.save(
        queryRunner.manager.create(HistoryEntry, {
          instanceId,
          eventType: EventType.SUBSTAGE_STARTED,
          stageId: stage.id,
          userId,
          metadata: {
            subStageId,
            subStageVisitId: subStageVisit.id,
            stageVisitId: stageVisit.id,
            visitNumber: stageVisit.visitNumber,
          },
        }),
      );
      await this.outboxService.enqueue(queryRunner.manager, {
        eventType: 'procedure.sub-stage.started',
        aggregateType: 'ProcedureInstance',
        aggregateId: instanceId,
        idempotencyKey: `procedure-sub-stage-started:${subStageVisit.id}`,
        payload: {
          instanceId,
          stageId: stage.id,
          subStageId,
          subStageVisitId: subStageVisit.id,
          actorId: userId,
        },
      });
      await this.auditService.append(queryRunner.manager, {
        actorId: userId,
        action: 'procedure.sub-stage.started',
        resourceType: 'SubStageVisit',
        resourceId: subStageVisit.id,
        afterState: {
          instanceId,
          stageId: stage.id,
          subStageId,
          startedAt: subStageVisit.startedAt,
        },
      });
      await queryRunner.commitTransaction();
      return this.findOne(instanceId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async addDocumentToSubStage(
    instanceId: string,
    subStageId: string,
    documentId: number,
  ): Promise<ProcedureInstance> {
    const instance = await this.findOne(instanceId);
    
    if (!instance.subStageMetadata) {
      instance.subStageMetadata = {};
    }
    
    if (!instance.subStageMetadata[subStageId]) {
      instance.subStageMetadata[subStageId] = {};
    }
    
    const currentDocs = instance.subStageMetadata[subStageId].documentIds || [];
    if (!currentDocs.includes(documentId)) {
      instance.subStageMetadata[subStageId].documentIds = [...currentDocs, documentId];
    }
    
    await this.instanceRepository.save(instance);
    return instance;
  }


/**
 * Appliquer une transition (manuelle ou automatique)
 * Version adaptée pour supporter les visites d'étapes
 */
  async applyTransition(
    instanceId: string,
    transitionId: string,
    userId: string,
    userInputs?: Record<string, any>,
    comment?: string,
  ): Promise<ProcedureInstance> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const instance = await queryRunner.manager.findOne(ProcedureInstance, {
        where: { id: instanceId },
        relations: [
          'template',
          'template.stages',
          'template.stages.subStages',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) {
        throw new NotFoundException('Instance procédurale non trouvée');
      }
      if (instance.status !== InstanceStatus.ACTIVE) {
        throw new BadRequestException(
          `Une transition exige une instance ACTIVE (${instance.status})`,
        );
      }

      const transition = await queryRunner.manager.findOne(Transition, {
        where: {
          id: transitionId,
          templateId: instance.templateVersionId,
          type: TransitionType.MANUAL,
        },
        relations: ['fromStage', 'toStage'],
      });

      if (!transition) {
        throw new NotFoundException(
          'Transition absente de la version du template de cette instance',
        );
      }
      if (transition.fromStageId !== instance.currentStageId) {
        throw new BadRequestException(
          "La transition ne part pas de l'étape courante",
        );
      }

      const currentVisit = await queryRunner.manager.findOne(StageVisit, {
        where: { instanceId, exitedAt: IsNull() },
        relations: ['subStageVisits'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!currentVisit || currentVisit.stageId !== instance.currentStageId) {
        throw new BadRequestException(
          "L'instance ne possède pas une visite active cohérente",
        );
      }

      const currentStage = instance.template.stages.find(
        (stage) => stage.id === instance.currentStageId,
      );
      if (!currentStage) {
        throw new BadRequestException(
          "L'étape courante n'appartient pas à la version du template",
        );
      }
      const blockingRequirements =
        await this.requirementService.getStageBlockingRequirements(
          queryRunner.manager,
          instanceId,
          currentStage,
          currentVisit,
        );
      if (blockingRequirements.length > 0) {
        throw new BadRequestException({
          message: 'Exigences procédurales obligatoires non satisfaites',
          requirements: blockingRequirements,
        });
      }

      const conditionSatisfied =
        await this.workflowService.evaluateCondition(transition.condition, {
          instance,
          stage: currentStage,
          stageVisit: currentVisit,
          event: { userInputs: userInputs ?? {} },
        });
      if (!conditionSatisfied) {
        throw new BadRequestException(
          "La condition de transition n'est pas satisfaite",
        );
      }
      const processedInputs = await this.processUserInputs(
        transition,
        userInputs ?? {},
        queryRunner,
        instance,
      );

      currentVisit.exitedAt = new Date();
      await queryRunner.manager.save(currentVisit);
      await queryRunner.manager.save(
        queryRunner.manager.create(Decision, {
          instanceId: instance.id,
          fromStageId: transition.fromStageId,
          toStageId: transition.toStageId,
          transition,
          userId,
          comment: comment ?? null,
        }),
      );
      await queryRunner.manager.save(
        queryRunner.manager.create(HistoryEntry, {
          instanceId: instance.id,
          eventType: EventType.STAGE_EXIT,
          stageId: transition.fromStageId,
          userId,
          metadata: {
            transitionId: transition.id,
            comment: comment ?? null,
            userInputs: processedInputs,
          },
        }),
      );

      instance.currentStageId = transition.toStageId;
      await queryRunner.manager.save(instance);

      const visitNumber =
        (await queryRunner.manager.count(StageVisit, {
          where: {
            instanceId: instance.id,
            stageId: transition.toStageId,
          },
        })) + 1;
      const nextVisit = await queryRunner.manager.save(
        queryRunner.manager.create(StageVisit, {
          instanceId: instance.id,
          stageId: transition.toStageId,
          visitNumber,
          enteredAt: new Date(),
          subStageVisits: [],
        }),
      );
      await queryRunner.manager.save(
        queryRunner.manager.create(HistoryEntry, {
          instanceId: instance.id,
          eventType: EventType.STAGE_ENTER,
          stageId: transition.toStageId,
          userId,
          metadata: {
            transitionId: transition.id,
            visitNumber,
            stageVisitId: nextVisit.id,
          },
        }),
      );
      await this.outboxService.enqueue(queryRunner.manager, {
        eventType: 'procedure.transition.applied',
        aggregateType: 'ProcedureInstance',
        aggregateId: instance.id,
        idempotencyKey: `procedure-transition:${instance.id}:${currentVisit.id}`,
        payload: {
          instanceId: instance.id,
          templateVersionId: instance.templateVersionId,
          transitionId: transition.id,
          fromStageId: transition.fromStageId,
          toStageId: transition.toStageId,
          actorId: userId,
        },
      });
      await this.auditService.append(queryRunner.manager, {
        actorId: userId,
        action: 'procedure.transition.applied',
        resourceType: 'ProcedureInstance',
        resourceId: instance.id,
        beforeState: {
          status: instance.status,
          currentStageId: transition.fromStageId,
        },
        afterState: {
          status: instance.status,
          currentStageId: transition.toStageId,
        },
        justification: comment ?? null,
      });

      await queryRunner.commitTransaction();
      return this.findOne(instanceId);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async completeInstance(
    instanceId: string,
    userId: string,
  ): Promise<ProcedureInstance> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const instance = await manager.findOne(ProcedureInstance, {
        where: { id: instanceId },
        relations: [
          'template',
          'template.stages',
          'template.stages.subStages',
          'stageVisits',
          'stageVisits.subStageVisits',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) {
        throw new NotFoundException('Instance procédurale non trouvée');
      }
      if (instance.status !== InstanceStatus.ACTIVE) {
        throw new BadRequestException(
          `Seule une instance ACTIVE peut être terminée (${instance.status})`,
        );
      }
      const outgoing = await manager.count(Transition, {
        where: {
          templateId: instance.templateVersionId,
          fromStageId: instance.currentStageId,
        },
      });
      if (outgoing > 0) {
        throw new BadRequestException(
          "L'étape courante n'est pas une arrivée du template",
        );
      }

      const blockingRequirements =
        await this.requirementService.getInstanceBlockingRequirements(
          manager,
          instanceId,
          instance.template.stages,
          instance.stageVisits,
        );
      if (blockingRequirements.length > 0) {
        throw new BadRequestException({
          message: 'Des exigences obligatoires restent à satisfaire',
          requirements: blockingRequirements,
        });
      }

      const activeVisit = await manager.findOne(StageVisit, {
        where: { instanceId, exitedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (activeVisit) {
        activeVisit.exitedAt = new Date();
        await manager.save(activeVisit);
      }
      instance.status = InstanceStatus.COMPLETED;
      await manager.save(instance);
      await manager.save(
        manager.create(HistoryEntry, {
          instanceId,
          eventType: EventType.INSTANCE_COMPLETED,
          stageId: instance.currentStageId,
          userId,
          metadata: {},
        }),
      );
      await this.outboxService.enqueue(manager, {
        eventType: 'procedure.instance.completed',
        aggregateType: 'ProcedureInstance',
        aggregateId: instanceId,
        idempotencyKey: `procedure-completed:${instanceId}`,
        payload: { instanceId, actorId: userId },
      });
      await this.auditService.append(manager, {
        actorId: userId,
        action: 'procedure.instance.completed',
        resourceType: 'ProcedureInstance',
        resourceId: instanceId,
        beforeState: { status: InstanceStatus.ACTIVE },
        afterState: {
          status: InstanceStatus.COMPLETED,
          currentStageId: instance.currentStageId,
        },
      });
    });
    return this.findOne(instanceId);
  }

  async cancelInstance(
    instanceId: string,
    userId: string,
    reason: string,
  ): Promise<ProcedureInstance> {
    if (!reason?.trim()) {
      throw new BadRequestException("Le motif d'annulation est obligatoire");
    }
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const instance = await manager.findOne(ProcedureInstance, {
        where: { id: instanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) {
        throw new NotFoundException('Instance procédurale non trouvée');
      }
      if (instance.status !== InstanceStatus.ACTIVE) {
        throw new BadRequestException(
          `Seule une instance ACTIVE peut être annulée (${instance.status})`,
        );
      }
      const activeVisit = await manager.findOne(StageVisit, {
        where: { instanceId, exitedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (activeVisit) {
        activeVisit.exitedAt = new Date();
        await manager.save(activeVisit);
      }
      instance.status = InstanceStatus.CANCELLED;
      await manager.save(instance);
      await manager.save(
        manager.create(HistoryEntry, {
          instanceId,
          eventType: EventType.INSTANCE_CANCELLED,
          stageId: instance.currentStageId,
          userId,
          metadata: { reason: reason.trim() },
        }),
      );
      await this.outboxService.enqueue(manager, {
        eventType: 'procedure.instance.cancelled',
        aggregateType: 'ProcedureInstance',
        aggregateId: instanceId,
        idempotencyKey: `procedure-cancelled:${instanceId}`,
        payload: { instanceId, actorId: userId, reason: reason.trim() },
      });
      await this.auditService.append(manager, {
        actorId: userId,
        action: 'procedure.instance.cancelled',
        resourceType: 'ProcedureInstance',
        resourceId: instanceId,
        beforeState: { status: InstanceStatus.ACTIVE },
        afterState: {
          status: InstanceStatus.CANCELLED,
          currentStageId: instance.currentStageId,
        },
        justification: reason.trim(),
      });
    });
    return this.findOne(instanceId);
  }

  /**
  * Exécuter une transition avec queryRunner (version unifiée)
  */
/**
 * Traiter les inputs utilisateur
 */
private async executeTransitionWithQueryRunner(
  candidateInstance: ProcedureInstance,
  candidateTransition: Transition,
  userId: string,
  comment: string,
  queryRunner: QueryRunner,
  eventData?: Record<string, any>,
): Promise<void> {
  const manager = queryRunner.manager;
  const instance = await manager.findOne(ProcedureInstance, {
    where: { id: candidateInstance.id },
    relations: ['template', 'template.stages', 'template.stages.subStages'],
    lock: { mode: 'pessimistic_write' },
  });
  if (!instance) {
    throw new NotFoundException('Instance procédurale non trouvée');
  }
  if (instance.status !== InstanceStatus.ACTIVE) {
    throw new BadRequestException(
      `Une transition exige une instance ACTIVE (${instance.status})`,
    );
  }

  const transition = await manager.findOne(Transition, {
    where: {
      id: candidateTransition.id,
      templateId: instance.templateVersionId,
      fromStageId: instance.currentStageId,
    },
    relations: ['fromStage', 'toStage'],
  });
  if (!transition) {
    throw new BadRequestException(
      "La transition n'appartient pas à la version ou à l'étape courante",
    );
  }

  const currentVisit = await manager.findOne(StageVisit, {
    where: { instanceId: instance.id, exitedAt: IsNull() },
    relations: ['subStageVisits'],
    lock: { mode: 'pessimistic_write' },
  });
  if (!currentVisit || currentVisit.stageId !== instance.currentStageId) {
    throw new BadRequestException(
      "L'instance ne possède pas une visite active cohérente",
    );
  }

  const stage = instance.template.stages.find(
    (item) => item.id === instance.currentStageId,
  );
  if (!stage) {
    throw new BadRequestException(
      "L'étape courante n'appartient pas à la version du template",
    );
  }
  const blockingRequirements =
    await this.requirementService.getStageBlockingRequirements(
      manager,
      instance.id,
      stage,
      currentVisit,
    );
  if (blockingRequirements.length > 0) {
    throw new BadRequestException({
      message: 'Exigences procédurales obligatoires non satisfaites',
      requirements: blockingRequirements,
    });
  }

  const context = {
    instance,
    stage,
    stageVisit: currentVisit,
    event: eventData ?? {},
  };
  const conditionSatisfied =
    (await this.workflowService.evaluateCondition(transition.condition, context)) &&
    (await this.workflowService.evaluateCondition(
      transition.triggerCondition,
      context,
    ));
  if (!conditionSatisfied) {
    throw new BadRequestException(
      "La condition de transition n'est pas satisfaite",
    );
  }

  currentVisit.exitedAt = new Date();
  await manager.save(currentVisit);
  await manager.save(
    manager.create(Decision, {
      instanceId: instance.id,
      fromStageId: transition.fromStageId,
      toStageId: transition.toStageId,
      transition,
      userId,
      comment,
    }),
  );
  await manager.save(
    manager.create(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_EXIT,
      stageId: transition.fromStageId,
      userId,
      metadata: {
        transitionId: transition.id,
        automatic: true,
        comment,
        eventData: eventData ?? null,
      },
    }),
  );

  instance.currentStageId = transition.toStageId;
  await manager.save(instance);
  const visitNumber =
    (await manager.count(StageVisit, {
      where: {
        instanceId: instance.id,
        stageId: transition.toStageId,
      },
    })) + 1;
  const nextVisit = await manager.save(
    manager.create(StageVisit, {
      instanceId: instance.id,
      stageId: transition.toStageId,
      visitNumber,
      enteredAt: new Date(),
      subStageVisits: [],
    }),
  );
  await manager.save(
    manager.create(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_ENTER,
      stageId: transition.toStageId,
      userId,
      metadata: {
        transitionId: transition.id,
        automatic: true,
        visitNumber,
        stageVisitId: nextVisit.id,
      },
    }),
  );
  await this.outboxService.enqueue(manager, {
    eventType: 'procedure.transition.applied',
    aggregateType: 'ProcedureInstance',
    aggregateId: instance.id,
    idempotencyKey: `procedure-transition:${instance.id}:${currentVisit.id}`,
    payload: {
      instanceId: instance.id,
      templateVersionId: instance.templateVersionId,
      transitionId: transition.id,
      fromStageId: transition.fromStageId,
      toStageId: transition.toStageId,
      actorId: userId,
      automatic: true,
      eventData: eventData ?? null,
    },
  });
  await this.auditService.append(manager, {
    actorId: userId,
    action: 'procedure.transition.applied',
    resourceType: 'ProcedureInstance',
    resourceId: instance.id,
    beforeState: {
      status: instance.status,
      currentStageId: transition.fromStageId,
    },
    afterState: {
      status: instance.status,
      currentStageId: transition.toStageId,
    },
    justification: comment,
  });
}

private async processUserInputs(
  transition: Transition,
  userInputs: Record<string, any>,
  queryRunner: any,
  instance: ProcedureInstance,
): Promise<Record<string, any>> {
  const processed: Record<string, any> = {};

  for (const input of transition.userInputs || []) {
    const value = userInputs[input.name];

    // Validation requis
    if (input.required) {
      if (!value && value !== 0 && value !== false) {
        throw new BadRequestException(`Le champ "${input.label}" est requis`);
      }
    }

    // Traitement selon le type
    switch (input.type) {
      case 'number':
        processed[input.name] = parseFloat(value);
        break;

      case 'checkbox':
        processed[input.name] = value === true || value === 'true';
        break;

      case 'select': {
        // Vérifier que la valeur est dans les options
        const isValidOption = input.options?.some(opt => opt.value === value);
        if (input.required && !isValidOption) {
          throw new BadRequestException(`La valeur "${value}" n'est pas valide pour "${input.label}"`);
        }
        processed[input.name] = value;
        break;
      }

      default:
        processed[input.name] = value;
    }
  }

  return processed;
}

/**
 * Vérifier et déclencher les transitions automatiques
 */
/**
 * Vérifie et déclenche les transitions automatiques
 * Version adaptée à StageVisit / SubStageVisit
 */
/**
 * Vérifie et déclenche les transitions automatiques
 * Condition importante : seulement si TOUTES les sous-étapes obligatoires de la visite courante sont complétées
 */
private async checkAndTriggerAutomaticTransitions(
  instanceId: string,
  userId: string,
  queryRunner?: QueryRunner,
): Promise<void> {
  const useExistingRunner = !!queryRunner;
  const runner = queryRunner || this.dataSource.createQueryRunner();
  
  try {
    if (!useExistingRunner) {
      await runner.connect();
      await runner.startTransaction();
    }

    // Récupérer l'instance avec le template et ses stages
    const instance = await runner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: ['template', 'template.stages', 'template.stages.subStages'],
    });

    if (!instance || !instance.template?.stages) {
      console.log(`[Auto Transition] Instance ou template non trouvé`);
      return;
    }

    // Récupérer la visite courante avec ses sous-visites
    const currentStageVisit = await runner.manager.findOne(StageVisit, {
      where: {
        instanceId: instanceId,
        exitedAt: IsNull(), // Visite active
      },
      relations: ['subStageVisits'],
    });

    if (!currentStageVisit) {
      console.log(`[Auto Transition] Aucune visite active trouvée`);
      return;
    }

    // ✅ Trouver l'étape correspondante dans le template
    const currentStageFromTemplate = instance.template.stages.find(
      stage => stage.id === currentStageVisit.stageId
    );

    if (!currentStageFromTemplate) {
      console.log(`[Auto Transition] Étape ou sous-étapes non trouvées dans le template`);
      return;
    }

    // ✅ Vérifier les sous-étapes obligatoires
    const blockingRequirements =
      await this.requirementService.getStageBlockingRequirements(
        runner.manager,
        instanceId,
        currentStageFromTemplate,
        currentStageVisit,
      );

    if (blockingRequirements.length > 0) {
      console.log(`[Auto Transition] Transition bloquée : toutes les sous-étapes obligatoires ne sont pas encore complétées`);
      return;
    }

    console.log(`[Auto Transition] Toutes les sous-étapes obligatoires sont complétées → recherche de transitions automatiques`);

    // ✅ Récupérer les transitions automatiques depuis l'étape courante
    const automaticTransitions = await runner.manager.find(Transition, {
      where: {
        fromStageId: currentStageVisit.stageId,
        type: TransitionType.AUTOMATIC,
        templateId: instance.templateVersionId,
      },
      relations: ['fromStage', 'toStage'],
      order: { id: 'ASC' },
    });

    if (automaticTransitions.length === 0) {
      if (!useExistingRunner) {
        await runner.commitTransaction();
      }
      console.log(`[Auto Transition] Aucune transition automatique trouvée`);
      return;
    }

    for (const transition of automaticTransitions) {
      let shouldTrigger = true;

      // Évaluer la condition supplémentaire
      if (transition.triggerCondition) {
        const completedSubStageIds = currentStageVisit.subStageVisits
          ?.filter(sv => sv.isCompleted)
          .map(sv => sv.subStageId) || [];

        const context = {
          instance: {
            id: instance.id,
            data: {},
          },
          stageVisit: {
            id: currentStageVisit.id,
            visitNumber: currentStageVisit.visitNumber,
            stageId: currentStageVisit.stageId,
            stageName: currentStageFromTemplate.name,
            completedSubStages: completedSubStageIds,
            enteredAt: currentStageVisit.enteredAt,
          },
          completedSubStages: completedSubStageIds,
        };

        shouldTrigger = await this.workflowService.evaluateCondition(
          transition.triggerCondition,
          context
        );
      }

      if (shouldTrigger) {
        console.log(`[Auto Transition] Déclenchement automatique vers l'étape ${transition.toStageId}`);

        // Fermer proprement la visite actuelle
        // Exécuter la transition
        await this.executeTransitionWithQueryRunner(
          instance,
          transition,
          userId,
          'Transition automatique déclenchée après complétion des sous-étapes obligatoires',
          runner,
        );

        // ✅ Créer une nouvelle visite pour l'étape destination
        // const newStageVisit = this.stageVisitRepository.create({
        //   instanceId: instance.id,
        //   stageId: transition.toStageId,
        //   visitNumber: (currentStageVisit.visitNumber || 0) + 1,
        //   enteredAt: new Date(),
        //   subStageVisits: [],
        // });
        // await runner.manager.save(newStageVisit);

        // Logger l'événement
        // await this.historyService.log(
        //   instance.id,
        //   EventType.TRANSITION_TRIGGERED,
        //   currentStageVisit.stageId,
        //   userId,
        //   {
        //     fromStageId: currentStageVisit.stageId,
        //     toStageId: transition.toStageId,
        //     transitionId: transition.id,
        //     fromVisitId: currentStageVisit.id,
        //     toVisitId: newStageVisit.id,
        //     visitNumber: newStageVisit.visitNumber,
        //     reason: 'Transition automatique après complétion des sous-étapes obligatoires',
        //   }
        // );

        if (!useExistingRunner) {
          await runner.commitTransaction();
        }
        
        // console.log(`[Auto Transition] Transition réussie vers l'étape ${transition.toStageId} (visite ${newStageVisit.visitNumber})`);
        // console.log(`[Auto Transition] Transition réussie vers l'étape ${transition.toStageId} (visite ${newStageVisit.visitNumber})`);
        break; // Une seule transition par appel
      }
    }

    if (!useExistingRunner && runner.isTransactionActive) {
      await runner.commitTransaction();
    }

  } catch (error) {
    if (!useExistingRunner) {
      await runner.rollbackTransaction();
    }
    console.error(`Erreur lors du déclenchement automatique :`, error);
    throw error;
  } finally {
    if (!useExistingRunner && runner) {
      await runner.release();
    }
  }
}

/**
 * Récupérer les transitions disponibles (version enrichie avec inputs)
 */
async getAvailableTransitionsWithInputs(instanceId: string): Promise<Array<Partial<Transition> & { expectsUserInput: boolean; userInputs?: any[] }>> {
  const transitions = await this.getAvailableTransitions(instanceId);
  return transitions.map(transition => ({
    ...transition,
    expectsUserInput: transition.expectsUserInput || false,
    userInputs: transition.userInputs, 
  }));
} 


// services/procedure-instance.service.ts (ajout)

/**
 * Déclencher un événement sur une instance (pour transitions automatiques)
 */
async triggerEventOnInstance(
  instanceId: string,
  eventType: string,
  eventData: any,
  userId: string = 'system'
): Promise<void> {
  if (this.secureProcedureCommandsOnly()) {
    return this.triggerEventTransaction(
      instanceId,
      eventType,
      eventData,
      userId,
    );
  }

  // Branche historique inaccessible pendant la reprise des anciens appels.
  const instance = await this.findOne(instanceId);
  
  // Récupérer les transitions automatiques qui écoutent cet événement
  const automaticTransitions = await this.transitionRepository.find({
    where: {
      fromStageId: instance.currentStageId,
      type: TransitionType.AUTOMATIC,
      triggerEvent: eventType,
    },
  });

  for (const transition of automaticTransitions) {
    // Évaluer la condition avec les données de l'événement
    let shouldTrigger = true;
    if (transition.triggerCondition) {
      const context = {
        instance: {
          data: {},
          completedSubStages: instance.completedSubStages,
        },
        event: eventData,
      };
      shouldTrigger = await this.workflowService.evaluateCondition(
        transition.triggerCondition,
        context,
      );
    }
    
    if (shouldTrigger) {
      // Exécuter la transition
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await this.executeTransitionWithQueryRunner(
          instance,
          transition,
          userId,
          `Transition déclenchée par événement: ${eventType}`,
          queryRunner,
          eventData,
        );
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Erreur lors du déclenchement automatique:', error);
      } finally {
        await queryRunner.release();
      }
    }
  }
}



/**
 * Récupère la visite courante de l'étape actuelle
 * Crée une nouvelle visite si aucune n'existe
 */
private async triggerEventTransaction(
  instanceId: string,
  eventType: string,
  eventData: Record<string, any>,
  userId: string,
): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('SERIALIZABLE');
  try {
    const instance = await queryRunner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: [
        'template',
        'template.stages',
        'template.stages.subStages',
      ],
      lock: { mode: 'pessimistic_write' },
    });
    if (!instance || instance.status !== InstanceStatus.ACTIVE) {
      throw new BadRequestException(
        'Un événement exige une instance procédurale ACTIVE',
      );
    }
    const candidates = await queryRunner.manager.find(Transition, {
      where: {
        templateId: instance.templateVersionId,
        fromStageId: instance.currentStageId,
        type: TransitionType.AUTOMATIC,
        triggerEvent: eventType,
      },
      order: { id: 'ASC' },
    });
    for (const transition of candidates) {
      const context = {
        instance,
        event: eventData ?? {},
      };
      const canApply =
        (await this.workflowService.evaluateCondition(
          transition.condition,
          context,
        )) &&
        (await this.workflowService.evaluateCondition(
          transition.triggerCondition,
          context,
        ));
      if (!canApply) continue;
      await this.executeTransitionWithQueryRunner(
        instance,
        transition,
        userId,
        `Transition déclenchée par l'événement ${eventType}`,
        queryRunner,
        eventData ?? {},
      );
      break;
    }
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async getCurrentStageVisit(instanceId: string): Promise<StageVisit> {
    const instance = await this.findOne(instanceId);
    if (this.secureProcedureCommandsOnly()) {
      return this.getCurrentStageVisitEntity(instance);
    }

    let visit = await this.stageVisitRepository.findOne({
      where: { instanceId, stageId: instance.currentStageId },
      order: { visitNumber: 'DESC' },
      relations: ['subStageVisits'],
    });

    if (!visit) {
      const visitCount = await this.stageVisitRepository.count({
        where: { instanceId, stageId: instance.currentStageId }
      });

      visit = this.stageVisitRepository.create({
        instanceId: instance.id,
        stageId: instance.currentStageId,
        visitNumber: visitCount + 1,
        completedSubStages: [],
        subStageMetadata: {},
        enteredAt: new Date(),
        subStageVisits: [],
      });

      await this.stageVisitRepository.save(visit);
    }

    return visit;
  }
/**
 * Récupère la visite courante de l'étape actuelle
 * Crée une nouvelle visite si aucune n'existe
 */
async getCurrentStageVisitEntity(instance: ProcedureInstance): Promise<StageVisit> {
    const instanceId = instance.id;

    const visit = await this.stageVisitRepository.findOne({
      where: {
        instanceId,
        stageId: instance.currentStageId,
        exitedAt: IsNull(),
      },
      order: { visitNumber: 'DESC' },
      relations: ['subStageVisits', 'currentSubStageVisit', 'currentSubStageVisit.subStage'],
    });

    if (!visit) {
      throw new BadRequestException(
        "L'instance ne possède pas de visite active cohérente ; une réparation est requise",
      );
    }

    return visit;
  }


/**
 * Réinitialiser une instance de procédure comme à la création
 * @param instanceId - ID de l'instance à réinitialiser
 * @param userId - ID de l'utilisateur effectuant la réinitialisation
 * @param options - Options de réinitialisation
 */
private async resetInstance(
  instanceId: string,
  userId: string,
  options?: {
    keepTitle?: boolean;
    keepData?: boolean;
    keepHistory?: boolean;
    reason?: string;
  }
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    throw new ForbiddenException(
      'La réinitialisation procédurale applicative est désactivée',
    );
  }
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Récupérer l'instance avec lock
    const instance = await queryRunner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      lock: { mode: 'pessimistic_write' },
    });
    
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${instanceId} not found`);
    }

    // Récupérer le template actuel
    const template = await this.templateService.findOne(instance.templateId);
    const firstStage = template.stages.sort((a, b) => a.order - b.order)[0];

    // Sauvegarder les données originales
    const originalTitle = instance.title;
    
    // 🔥 Préparer les données de réinitialisation
    const resetData: Partial<ProcedureInstance> = {
      status: InstanceStatus.ACTIVE,
      currentStageId: firstStage.id,
      // ✅ Réinitialiser les sous-étapes complétées
      completedSubStages: [],
      // ✅ Réinitialiser les métadonnées des sous-étapes
      subStageMetadata: {},
      // ✅ Réinitialiser les compteurs de cycles
      cycleUsageCount: {},
    };

    // Gestion du titre
    if (options?.keepTitle) {
      resetData.title = originalTitle;
    } else {
      resetData.title = `${originalTitle} (Réinitialisée)`;
    }

    // 🔥 Mettre à jour l'instance
    await queryRunner.manager.update(ProcedureInstance, instance.id, resetData);

    // Supprimer les décisions si demandé
    if (!options?.keepHistory) {
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from('decisions')
        .where('instanceId = :instanceId', { instanceId: instance.id })
        .execute();
    }

    // 🔥 Enregistrer l'historique de la réinitialisation
    const historyEntry1 = queryRunner.manager.create(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.DECISION,
      stageId: instance.currentStageId,
      userId: userId || 'system',
      metadata: {
        action: 'reset',
        fromStage: instance.currentStageId,
        toStage: firstStage.id,
        completedSubStages: instance.completedSubStages,
        subStageMetadata: instance.subStageMetadata, // ✅ Sauvegarder l'ancien état
        cycleUsageCount: instance.cycleUsageCount,
        reason: options?.reason || 'Réinitialisation manuelle',
      },
    });
    await queryRunner.manager.save(historyEntry1);

    // 🔥 Enregistrer l'entrée dans le premier stage
    const historyEntry2 = queryRunner.manager.create(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_ENTER,
      stageId: firstStage.id,
      userId: userId || 'system',
      metadata: {
        message: 'Instance réinitialisée',
        fromStage: instance.currentStageId,
        reason: options?.reason,
        keepData: options?.keepData,
        keepTitle: options?.keepTitle,
      },
    });
    await queryRunner.manager.save(historyEntry2);

    await queryRunner.commitTransaction();

    // Retourner l'instance mise à jour
    return this.findOne(instance.id);
    
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('Error resetting instance:', error);
    
    if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
      throw new BadRequestException(
        'La réinitialisation est temporairement indisponible, veuillez réessayer'
      );
    }
    
    throw new BadRequestException(`Erreur lors de la réinitialisation: ${error.message}`);
  } finally {
    await queryRunner.release();
  }
}
    // services/procedure-instance.service.ts


/**
 * Réinitialiser une instance complètement (comme à la création)
 * Supprime toutes les StageVisit et SubStageVisit
 */
private async resetInstanceSimple(
    instanceId: string,
    userId: string,
    reason?: string
): Promise<ProcedureInstance> {
    if (this.secureProcedureCommandsOnly()) {
      throw new ForbiddenException(
        'La réinitialisation procédurale applicative est désactivée',
      );
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const instance = await this.findOne(instanceId);
        const template = await this.templateService.findOne(instance.templateId);
        const firstStage = template.stages.sort((a, b) => a.order - b.order)[0];

        // 1. Supprimer toutes les visites et sous-visites existantes
        await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from('sub_stage_visits')
            .where('stageVisitId IN (SELECT id FROM stage_visits WHERE instanceId = :instanceId)', { instanceId })
            .execute();

        await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from('stage_visits')
            .where('instanceId = :instanceId', { instanceId })
            .execute();

        // 2. Réinitialiser l'instance principale
        await queryRunner.manager.update(ProcedureInstance, instance.id, {
            status: InstanceStatus.ACTIVE,
            currentStageId: firstStage.id,
            completedSubStages: [],        // Déprécié mais conservé
            cycleUsageCount: {},
            subStageMetadata: {},          // Déprécié
            updated_at: new Date(),
        });

        // 3. Créer une nouvelle visite pour la première étape (comme à la création)
        const newStageVisit = this.stageVisitRepository.create({
            instanceId: instance.id,
            stageId: firstStage.id,
            visitNumber: 1,
            completedSubStages: [],
            subStageMetadata: {},
            enteredAt: new Date(),
            subStageVisits: [],
        });

        await queryRunner.manager.save(newStageVisit);

        // 4. Enregistrer dans l'historique
        await this.historyService.log(
            instance.id,
            EventType.DECISION,
            instance.currentStageId,
            userId,
            { 
                action: 'reset_simple',
                reason: reason || 'Réinitialisation complète',
                fromStage: instance.currentStageId,
                toStage: firstStage.id,
                message: 'Toutes les visites ont été supprimées'
            }
        );

        await this.historyService.log(
            instance.id,
            EventType.STAGE_ENTER,
            firstStage.id,
            userId,
            { 
                message: 'Nouvelle instance réinitialisée - Première visite créée',
                visitNumber: 1,
                stageVisitId: newStageVisit.id,
                reason: reason || 'Réinitialisation complète'
            }
        );

        await queryRunner.commitTransaction();

        console.log(`Instance ${instanceId} réinitialisée complètement. Nouvelle visite créée pour l'étape ${firstStage.name}`);

        return this.findOne(instance.id);
        
    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Erreur lors de la réinitialisation simple:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}




// services/procedure-instance.service.ts

/**
 * COMPLÉTER TOUTES LES SOUS-ÉTAPES DE L'ÉTAPE COURANTE (UNIQUEMENT POUR TESTS)
 * 
 * @warning Cette méthode est destinée uniquement aux tests et au développement.
 * Elle complète toutes les sous-étapes de l'étape courante en une seule opération.
 * 
 * @param instanceId - ID de l'instance
 * @param userId - ID de l'utilisateur
 * @param options - Options supplémentaires
 * @returns L'instance mise à jour
 */
private async completeAllSubStagesInCurrentStage(
  instanceId: string,
  userId: string,
  options?: {
    notes?: string;
    skipAutoTransitions?: boolean;
    forceComplete?: boolean; // Force la complétion même si déjà complétées
  }
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    throw new ForbiddenException(
      'La complétion globale de sous-étapes est désactivée',
    );
  }
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Récupérer l'instance avec lock
    const instance = await queryRunner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: ['currentStage', 'currentStage.subStages'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!instance) {
      throw new NotFoundException(`Instance avec l'ID ${instanceId} non trouvée`);
    }

    if (!instance.currentStage) {
      throw new BadRequestException('L\'instance n\'a pas d\'étape courante');
    }

    const currentStage = instance.currentStage;
    const allSubStages = currentStage.subStages || [];
    
    if (allSubStages.length === 0) {
      throw new BadRequestException('L\'étape courante n\'a pas de sous-étapes');
    }

    // Filtrer les sous-étapes à compléter
    const subStagesToComplete = options?.forceComplete 
      ? allSubStages 
      : allSubStages.filter(ss => !instance.completedSubStages?.includes(ss.id));

    if (subStagesToComplete.length === 0) {
      throw new BadRequestException('Toutes les sous-étapes sont déjà complétées');
    }

    console.log(`📝 Complétion de ${subStagesToComplete.length} sous-étapes pour le test...`);

    // Initialiser les structures si nécessaire
    const completedSubStages = [...(instance.completedSubStages || [])];
    const subStageMetadata = { ...(instance.subStageMetadata || {}) };

    // Compléter chaque sous-étape
    for (const subStage of subStagesToComplete) {
      if (!completedSubStages.includes(subStage.id)) {
        completedSubStages.push(subStage.id);
        
        // Ajouter les métadonnées
        subStageMetadata[subStage.id] = {
          ...subStageMetadata[subStage.id],
          completedAt: new Date().toISOString(),
          notes: options?.notes || `Complétée automatiquement par test le ${new Date().toISOString()}`,
        //   completedBy: userId,
        //   isTestCompletion: true,
        };
      }
    }

    // Mettre à jour l'instance
    await queryRunner.manager.update(ProcedureInstance, instance.id, {
      completedSubStages,
      subStageMetadata,
    });

    // Enregistrer l'historique pour chaque sous-étape complétée
    for (const subStage of subStagesToComplete) {
      await queryRunner.manager.save(HistoryEntry, {
        instanceId: instance.id,
        eventType: EventType.SUBSTAGE_COMPLETED,
        stageId: currentStage.id,
        subStageId: subStage.id,
        userId: userId || 'system',
        metadata: {
          notes: options?.notes,
          isTestCompletion: true,
          completedAt: new Date().toISOString(),
        },
      });
    }

    // Enregistrer un événement de test
    await queryRunner.manager.save(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.DECISION,
      stageId: currentStage.id,
      userId: userId || 'system',
      metadata: {
        action: 'test_complete_all_substages',
        completedCount: subStagesToComplete.length,
        totalSubStages: allSubStages.length,
        timestamp: new Date().toISOString(),
      },
    });

    await queryRunner.commitTransaction();

    // Vérifier et déclencher les transitions automatiques si demandé
    if (!options?.skipAutoTransitions) {
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId, queryRunner);
    }

    // Retourner l'instance mise à jour
    return this.findOne(instanceId);

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('Erreur lors de la complétion des sous-étapes:', error);
    throw new BadRequestException(
      `Erreur lors de la complétion des sous-étapes: ${error.message}`
    );
  } finally {
    await queryRunner.release();
  }
}

/**
 * COMPLÉTER TOUTES LES SOUS-ÉTAPES D'UNE ÉTAPE SPÉCIFIQUE (UNIQUEMENT POUR TESTS)
 * 
 * @param instanceId - ID de l'instance
 * @param stageId - ID de l'étape dont on veut compléter les sous-étapes
 * @param userId - ID de l'utilisateur
 * @param options - Options supplémentaires
 * @returns L'instance mise à jour
 */
private async completeAllSubStagesInStage(
  instanceId: string,
  stageId: string,
  userId: string,
  options?: {
    notes?: string;
    skipAutoTransitions?: boolean;
    forceComplete?: boolean;
  }
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    throw new ForbiddenException(
      'La complétion globale de sous-étapes est désactivée',
    );
  }
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Récupérer l'instance et vérifier l'étape
    const instance = await queryRunner.manager.findOne(ProcedureInstance, {
      where: { id: instanceId },
      relations: ['template', 'template.stages', 'template.stages.subStages'],
      lock: { mode: 'pessimistic_write' },
    });

    if (!instance) {
      throw new NotFoundException(`Instance avec l'ID ${instanceId} non trouvée`);
    }

    const targetStage = instance.template.stages?.find(s => s.id === stageId);
    if (!targetStage) {
      throw new NotFoundException(`Étape avec l'ID ${stageId} non trouvée dans ce template`);
    }

    const allSubStages = targetStage.subStages || [];
    
    if (allSubStages.length === 0) {
      throw new BadRequestException('Cette étape n\'a pas de sous-étapes');
    }

    // Filtrer les sous-étapes à compléter
    const subStagesToComplete = options?.forceComplete 
      ? allSubStages 
      : allSubStages.filter(ss => !instance.completedSubStages?.includes(ss.id));

    if (subStagesToComplete.length === 0) {
      throw new BadRequestException('Toutes les sous-étapes de cette étape sont déjà complétées');
    }

    console.log(`📝 Complétion de ${subStagesToComplete.length} sous-étapes pour l'étape ${targetStage.name}...`);

    // Compléter les sous-étapes
    const completedSubStages = [...(instance.completedSubStages || [])];
    const subStageMetadata = { ...(instance.subStageMetadata || {}) };

    for (const subStage of subStagesToComplete) {
      if (!completedSubStages.includes(subStage.id)) {
        completedSubStages.push(subStage.id);
        
        subStageMetadata[subStage.id] = {
          ...subStageMetadata[subStage.id],
          completedAt: new Date().toISOString(),
          notes: options?.notes || `Complétée par test (étape ${targetStage.name})`,
        //   completedBy: userId,
        //   isTestCompletion: true,
        };
      }
    }

    await queryRunner.manager.update(ProcedureInstance, instance.id, {
      completedSubStages,
      subStageMetadata,
    });

    // Enregistrer l'historique
    for (const subStage of subStagesToComplete) {
      await queryRunner.manager.save(HistoryEntry, {
        instanceId: instance.id,
        eventType: EventType.SUBSTAGE_COMPLETED,
        stageId: targetStage.id,
        subStageId: subStage.id,
        userId: userId || 'system',
        metadata: {
          notes: options?.notes,
          isTestCompletion: true,
          completedAt: new Date().toISOString(),
        },
      });
    }

    await queryRunner.commitTransaction();

    // Si l'étape ciblée est l'étape courante et qu'on ne skip pas les transitions
    if (!options?.skipAutoTransitions && instance.currentStageId === stageId) {
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId, queryRunner);
    }

    return this.findOne(instanceId);

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('Erreur lors de la complétion des sous-étapes:', error);
    throw new BadRequestException(
      `Erreur lors de la complétion des sous-étapes: ${error.message}`
    );
  } finally {
    await queryRunner.release();
  }
}

/**
 * COMPLÉTER TOUTES LES SOUS-ÉTAPES DE TOUTES LES ÉTAPES (UNIQUEMENT POUR TESTS)
 * 
 * @warning Cette méthode complète TOUTES les sous-étapes de l'instance
 * 
 * @param instanceId - ID de l'instance
 * @param userId - ID de l'utilisateur
 * @param options - Options supplémentaires
 * @returns L'instance mise à jour
 */
private async completeAllSubStagesInAllStages(
  instanceId: string,
  userId: string,
  options?: {
    notes?: string;
    skipAutoTransitions?: boolean;
    finalStageId?: string; // Optionnel: ID de l'étape finale à atteindre
  }
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    throw new ForbiddenException(
      'La complétion globale de sous-étapes est désactivée',
    );
  }
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const instance = await this.findOne(instanceId);
    const allStages = instance.template.stages?.sort((a, b) => a.order - b.order) || [];
    
    let currentStageId = instance.currentStageId;
    const allSubStageIds: string[] = [];
    const subStageMetadata: any = { ...(instance.subStageMetadata || {}) };

    // Collecter toutes les sous-étapes
    for (const stage of allStages) {
      for (const subStage of stage.subStages) {
        if (!allSubStageIds.includes(subStage.id)) {
          allSubStageIds.push(subStage.id);
          
          subStageMetadata[subStage.id] = {
            ...subStageMetadata[subStage.id],
            completedAt: new Date().toISOString(),
            notes: options?.notes || `Complétée par test (toutes les étapes)`,
            completedBy: userId,
            isTestCompletion: true,
          };
        }
      }
    }

    // Mettre à jour l'instance
    const updateData: any = {
      completedSubStages: allSubStageIds,
      subStageMetadata,
    };

    // Si une étape finale est spécifiée, l'utiliser
    if (options?.finalStageId) {
      updateData.currentStageId = options.finalStageId;
    }

    await queryRunner.manager.update(ProcedureInstance, instance.id, updateData);

    // Enregistrer l'historique de test
    await queryRunner.manager.save(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.DECISION,
      stageId: instance.currentStageId,
      userId: userId || 'system',
      metadata: {
        action: 'test_complete_all_substages_all_stages',
        completedCount: allSubStageIds.length,
        totalStages: allStages.length,
        finalStageId: options?.finalStageId,
        timestamp: new Date().toISOString(),
      },
    });

    await queryRunner.commitTransaction();

    // Déclencher les transitions automatiques si demandé
    if (!options?.skipAutoTransitions) {
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId, queryRunner);
    }

    return this.findOne(instanceId);

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('Erreur lors de la complétion de toutes les sous-étapes:', error);
    throw new BadRequestException(
      `Erreur lors de la complétion de toutes les sous-étapes: ${error.message}`
    );
  } finally {
    await queryRunner.release();
  }
}

// procedure-instance.service.ts

  /**
  * Naviguer temporairement vers une étape spécifique (pour consultation)
  * Ne modifie pas le currentStage de l'instance, juste pour l'affichage
  */
  async navigateToStage(
    instanceId: string,
    stageId: string,
  ): Promise<{ 
    instance: ProcedureInstance;
    targetStage: Stage;
    canCompleteSubStages: boolean;
  }> {
    const instance = await this.findOne(instanceId);
    
    const targetStage = instance.template.stages?.find(s => s.id === stageId);
    if (!targetStage) {
      throw new NotFoundException(`Stage with ID ${stageId} not found`);
    }

    const canCompleteSubStages =
      instance.status === InstanceStatus.ACTIVE &&
      targetStage.id === instance.currentStageId;

    return {
      instance,
      targetStage,
      canCompleteSubStages,
    };
  }

  /**
 * Revenir à une étape précédente pour compléter des sous-étapes
 * Ne change que la vue, pas le workflow réel
 * Les sous-étapes complétées sont enregistrées normalement
 */
async goBackToStage(
  instanceId: string,
  stageId: string,
  userId: string,
  options?: {
    allowCompleteOptional?: boolean;
    reason?: string;
  }
): Promise<{
  instance: ProcedureInstance;
  targetStage: Stage;
  completedSubStagesInStage: string[];
  remainingSubStages: SubStage[];
}> {
  const instance = await this.findOne(instanceId);
  
  const sortedStages = [...instance.template.stages].sort((a, b) => a.order - b.order);
  const currentStageIndex = sortedStages.findIndex(s => s.id === instance.currentStageId);
  const targetStageIndex = sortedStages.findIndex(s => s.id === stageId);
  
  // Vérifier que l'étape cible est avant ou égale à l'étape courante
  if (targetStageIndex > currentStageIndex) {
    throw new BadRequestException(
      'Cannot go back to a future stage. Only current or previous stages are accessible.'
    );
  }
  
  const targetStage = sortedStages[targetStageIndex];
  
  // Identifier les sous-étapes déjà complétées dans cette étape
  const completedSubStagesInStage = (targetStage.subStages || [])
    .filter(ss => instance.completedSubStages?.includes(ss.id))
    .map(ss => ss.id);
  
  // Identifier les sous-étapes restantes (optionnelles uniquement si on ne force pas)
  const remainingSubStages = (targetStage.subStages || []).filter(ss => {
    const isCompleted = instance.completedSubStages?.includes(ss.id);
    if (isCompleted) return false;
    
    // Si on permet seulement les optionnelles, filtrer les obligatoires
    if (!options?.allowCompleteOptional && ss.isMandatory) {
      return false; // Les obligatoires ne peuvent pas être complétées en retour arrière
    }
    
    return true;
  });
  
  // Enregistrer dans l'historique
  await this.historyService.log(
    instance.id,
    EventType.DECISION,
    stageId,
    userId,
    {
      action: 'go_back_to_stage',
      fromStageId: instance.currentStageId,
      reason: options?.reason,
      allowCompleteOptional: options?.allowCompleteOptional,
    },
  );
  
  return {
    instance,
    targetStage,
    completedSubStagesInStage,
    remainingSubStages,
  };
}

/**
 * Compléter une sous-étape dans une étape précédente
 */
private async completeSubStageInPreviousStage(
  instanceId: string,
  subStageId: string,
  stageId: string,
  userId: string,
  notes?: string,
): Promise<ProcedureInstance> {
  if (this.secureProcedureCommandsOnly()) {
    throw new ForbiddenException(
      'La complétion rétroactive hors visite active est désactivée',
    );
  }
  const instance = await this.findOne(instanceId);
  
  // Vérifier que la sous-étape appartient bien à l'étape spécifiée
  const targetStage = instance.template.stages?.find(s => s.id === stageId);
  if (!targetStage) {
    throw new NotFoundException(`Stage ${stageId} not found`);
  }
  
  const subStage = targetStage.subStages?.find(ss => ss.id === subStageId);
  if (!subStage) {
    throw new NotFoundException(`SubStage ${subStageId} not found in stage ${stageId}`);
  }
  
  // Vérifier qu'on a le droit de compléter cette sous-étape
  const sortedStages = [...instance.template.stages].sort((a, b) => a.order - b.order);
  const currentStageIndex = sortedStages.findIndex(s => s.id === instance.currentStageId);
  const targetStageIndex = sortedStages.findIndex(s => s.id === stageId);
  
  if (targetStageIndex > currentStageIndex) {
    throw new BadRequestException('Cannot complete sub-stage in a future stage');
  }
  
  // Pour les sous-étapes obligatoires dans les étapes passées, on bloque (elles devraient déjà être complétées)
  if (subStage.isMandatory && targetStageIndex < currentStageIndex) {
    throw new BadRequestException(
      'Mandatory sub-stages in previous stages cannot be completed retroactively. They should have been completed when the stage was current.'
    );
  }
  
  // Si déjà complétée
  if (instance.completedSubStages?.includes(subStageId)) {
    throw new BadRequestException('SubStage already completed');
  }
  
  // Compléter la sous-étape
  instance.completedSubStages = [...(instance.completedSubStages || []), subStageId];
  
  if (!instance.subStageMetadata) {
    instance.subStageMetadata = {};
  }
  
  instance.subStageMetadata[subStageId] = {
    ...instance.subStageMetadata[subStageId],
    completedAt: new Date().toISOString(),
    notes: notes,
    completedInStage: stageId,
    wasPreviousStage: targetStageIndex < currentStageIndex,
  };
  
  await this.instanceRepository.save(instance);
  
  await this.historyService.log(
    instanceId,
    EventType.SUBSTAGE_COMPLETED,
    stageId,
    userId,
    { 
      subStageId, 
      notes,
      wasPreviousStage: true,
      currentStageId: instance.currentStageId,
    },
  );
  
  // Ne pas déclencher de transitions automatiques car on est dans une étape passée
  // Le currentStage n'a pas changé
  
  return this.findOne(instanceId);
}


  /**
  * Vérifie s'il y a une sous-étape en cours dans la visite courante
  */
  async hasOngoingSubStage(instanceId: string): Promise<{ hasOngoing: boolean; ongoingSubStage?: SubStage }> {
    const currentStageVisit = await this.getCurrentStageVisit(instanceId);
    
    const ongoingSubStageVisit = currentStageVisit.subStageVisits?.find(
      sv => !sv.isCompleted && sv.completedAt === null
    );
    
    if (!ongoingSubStageVisit) {
      return { hasOngoing: false };
    }
    
    const ongoingSubStage = await this.subStageRepository.findOne({
      where: { id: ongoingSubStageVisit.subStageId }
    });
    
    return {
      hasOngoing: true,
      ongoingSubStage: ongoingSubStage || undefined,
    };
  }

  /**
  * Récupère la sous-étape en cours (si elle existe)
  */
  async getCurrentOngoingSubStage(instanceId: string): Promise<SubStageVisit | null> {
    const currentStageVisit = await this.getCurrentStageVisit(instanceId);
    
    return currentStageVisit.subStageVisits?.find(
      sv => !sv.isCompleted && sv.completedAt === null
    ) || null;
  }

}
