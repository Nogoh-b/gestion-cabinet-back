// services/procedure-instance.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, IsNull } from 'typeorm';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import { Cycle } from '../entities/cycle.entity';
import { ProcedureTemplateService } from './procedure-template.service';
import { WorkflowService } from './workflow.service';
import { HistoryService } from './history.service';
import { CreateProcedureInstanceDto, UpdateProcedureInstanceDto } from '../dto/create-procedure-instance.dto';
import { EventType, InstanceStatus, TransitionType } from '../entities/enums/instance-status.enum';
import { HistoryEntry } from '../entities/history-entry.entity';
import { InstanceMapperService } from './instance-sub-stage.service';
import { MappedInstance } from '../entities/type/instance-status.enum';
import { StageVisit } from '../entities/stage-visit.entity';
import { SubStageVisit } from '../entities/sub-stage-visit.entity';

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

  ) {}

  async create(dto: CreateProcedureInstanceDto, userId: string): Promise<ProcedureInstance> {
      const template = await this.templateService.findOne(dto.templateId);

      if (!template.stages || template.stages.length === 0) {
        throw new Error('Template has no stages');
      }

      const firstStage = template.stages.sort((a, b) => a.order - b.order)[0];

      const instance = this.instanceRepository.create({
        templateId: dto.templateId,
        title: dto.title,
        status: InstanceStatus.ACTIVE,
        currentStageId: firstStage.id,
        data: dto.data || {},
        completedSubStages: [],
        cycleUsageCount: {},
      });

      await this.instanceRepository.save(instance);

      // Créer la première visite
      await this.getCurrentStageVisit(instance.id);

      await this.historyService.log(
        instance.id,
        EventType.STAGE_ENTER,
        firstStage.id,
        userId,
        { message: 'Instance créée' },
      );

      return this.findOne(instance.id);
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
  skipAutoTransitions: boolean = false,
): Promise<ProcedureInstance> {
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const instance = await this.findOne(instanceId);
    let currentStageVisit = await this.getCurrentStageVisitEntity(instance);

    // Vérifier que c'est bien la sous-étape en cours
    if (currentStageVisit.currentSubStageVisitId) {
      const ongoingSubStage = await queryRunner.manager.findOne(SubStageVisit, {
        where: { id: currentStageVisit.currentSubStageVisitId }
      });
      
      if (ongoingSubStage && ongoingSubStage.subStageId !== subStageId) {
        throw new BadRequestException(
          `Vous ne pouvez pas compléter cette sous-étape car "${ongoingSubStage.subStageId}" est en cours.`
        );
      }
    }

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
      subStageVisit.isCompleted = true;
      subStageVisit.completedAt = new Date();
      subStageVisit.metadata = { ...subStageVisit.metadata, notes, lastCompletedBy: userId };
    }

    await queryRunner.manager.save(subStageVisit);

    // 🔥 Nettoyer le champ currentSubStageVisitId
    if (currentStageVisit.currentSubStageVisitId === subStageVisit.id) {
      await queryRunner.manager.update(StageVisit, currentStageVisit.id, {
        currentSubStageVisitId: null,
      });
    }

    await queryRunner.commitTransaction();

    await this.historyService.log(
      instanceId,
      EventType.SUBSTAGE_COMPLETED,
      instance.currentStageId,
      userId,
      { 
        subStageId, 
        visitNumber: currentStageVisit.visitNumber,
        subStageVisitId: subStageVisit.id,
        notes 
      }
    );

    // if (!skipAutoTransitions) {
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId, queryRunner);
    // }

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

    const userHasChosenTransition = instance.data?._pendingTransition;
    if (userHasChosenTransition) {
      console.log('Skipping automatic transition because user has chosen a manual transition');
      continue;
    }

    // Évaluer la condition si présente
    let shouldTrigger = true;
    if (transition.triggerCondition) {
      const context = {
        instance: {
          data: instance.data,
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
          data: instance.data, 
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
        updatedAt: new Date(),
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
        createdAt: new Date(),
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
        createdAt: new Date(),
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
        createdAt: new Date(),
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

private generateUuid(): string {
  // Utiliser une fonction UUID de la base de données ou crypto
  return crypto.randomUUID();
}


  

  /**
   * Récupérer les cycles disponibles pour une instance
   */
  async getAvailableCycles(instanceId: string): Promise<Cycle[]> {
    const instance = await this.findOne(instanceId);
    
    const cycles = await this.cycleRepository.find({
      where: { fromStageId: instance.currentStageId },
    });
    
    const available: Cycle[] = [];
    for (const cycle of cycles) {
      // Vérifier le nombre maximum de retours
      const usedCount = (instance.cycleUsageCount?.[cycle.id] || 0);
      if (cycle.maxLoops && usedCount >= cycle.maxLoops) {
        continue;
      }
      
      // Vérifier la condition
      if (cycle.condition) {
        const context = {
          instance: { 
            data: instance.data, 
            completedSubStages: instance.completedSubStages 
          },
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
  const currentStageVisit = await this.getCurrentStageVisitEntity(instance);

  // Récupérer toutes les transitions manuelles depuis l'étape courante
  const transitions = await this.transitionRepository.find({
    where: {
      fromStageId: instance.currentStageId,
      // type: TransitionType.MANUAL,
    },
    relations: ['fromStage', 'toStage'],
  });
  console.log(transitions)
  const available: Transition[] = [];

  for (const transition of transitions) {
    let shouldBeAvailable = true;

    // Si la transition a une condition, on l'évalue avec les données de la visite courante
    if (transition.condition) {
      const context = {
        instance: {
          data: instance.data,
          // On passe les sous-étapes complétées de la VISITE COURANTE
          completedSubStages: currentStageVisit.completedSubStages || [],
        },
        stageVisit: {
          visitNumber: currentStageVisit.visitNumber,
          completedSubStages: currentStageVisit.completedSubStages || [],
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

  async findAll(filters?: { status?: InstanceStatus; templateId?: string }): Promise<ProcedureInstance[]> {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.templateId) where.templateId = filters.templateId;

    return this.instanceRepository.find({
      where,
      relations: ['template', 'currentStage', 'tasks'],
      order: { createdAt: 'DESC' },
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

      if (!instance.completedSubStages) instance.completedSubStages = [];
      if (!instance.cycleUsageCount) instance.cycleUsageCount = {};

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


  async update(id: string, dto: UpdateProcedureInstanceDto): Promise<ProcedureInstance> {
    // Mise à jour directe sans find
    const updateResult = await this.instanceRepository.update(id, {
      // Mappez les champs du DTO vers l'entité
      ...dto,
      updatedAt: new Date(),
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

  async updateStatus(id: string, status: InstanceStatus, userId: string): Promise<ProcedureInstance> {
    const instance = await this.findOne(id);
    instance.status = status;
    await this.instanceRepository.save(instance);

    await this.historyService.log(
      instance.id,
      EventType.DECISION,
      instance.currentStageId,
      userId,
      { status, action: 'status_updated' },
    );

    return instance;
  }

  async getWorkflowStatus(id: string): Promise<any> {
    const instance = await this.findOne(id);
    const availableTransitions = await this.getAvailableTransitions(id);
    const availableCycles = await this.getAvailableCycles(id);
    const currentVisit = await this.getCurrentStageVisitEntity(instance);

    const mapped = await this.instanceMapper.mapInstanceWithCurrentTemplate(instance, instance.template, currentVisit);
    // Calculer la progression
    const totalMandatorySubStages = instance.template.stages.reduce(
      (acc, stage) => acc + stage.subStages.filter(ss => ss.isMandatory).length, 0
    );
    const progress = totalMandatorySubStages > 0 
      ? Math.round((instance.completedSubStages.length / totalMandatorySubStages) * 100)
      : 0;

    return {
      instance: {   
        ...mapped.instance,
        currentStage: mapped.currentStage,  // Remplacer par le stage mappé
        },
      currentVisitNumber: currentVisit.visitNumber,
      stages: mapped.stages,
      currentVisit: currentVisit,
      currentStage: mapped.currentStage,
      progress: mapped.progress,
      availableTransitions,
      availableCycles,
      completedSubStages: instance.completedSubStages,
      cycleUsageCount: instance.cycleUsageCount,
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
      relations: ['stage','subStageVisits','subStageVisits.subStage', 'subStageVisits.documents', 'subStageVisits.diligences',  'subStageVisits.audiences', 'subStageVisits.factures'],
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
  const queryRunner = this.dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const instance = await this.findOne(instanceId);
    let currentStageVisit = await this.getCurrentStageVisitEntity(instance);

    // 🔥 Vérifier s'il y a déjà une sous-étape en cours (via le nouveau champ)
    if (currentStageVisit.currentSubStageVisitId) {
      const ongoingSubStage = await queryRunner.manager.findOne(SubStageVisit, {
        where: { id: currentStageVisit.currentSubStageVisitId }
      });
      
      if (ongoingSubStage && !ongoingSubStage.isCompleted) {
        throw new BadRequestException(
          `Une sous-étape est déjà en cours. Veuillez la compléter avant d'en démarrer une nouvelle.`
        );
      }
    }

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
  async addDocumentToSubStage(
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
    await queryRunner.startTransaction();

    try {
      const instance = await this.findOne(instanceId);
      const transition = await this.transitionRepository.findOne({
        where: { id: transitionId },
        relations: ['fromStage', 'toStage'],
      });

      if (!transition) throw new NotFoundException('Transition non trouvée');

      if(instance.currentStageProgress.mandatoryCompleted != instance.currentStageProgress.mandatoryTotal) {
        throw new BadRequestException('Vous devez compléter toutes les sous-étapes obligatoires avant de pouvoir effectuer une transition.');
      }

      // Fermer la visite actuelle
      const currentVisit = await this.stageVisitRepository.findOne({
        where: { instanceId, stageId: transition.fromStageId },
        order: { visitNumber: 'DESC' },
      });

      if (currentVisit && !currentVisit.exitedAt) {
        currentVisit.exitedAt = new Date();
        await queryRunner.manager.save(currentVisit);
      }

      // Exécuter la transition
      await this.executeTransitionWithQueryRunner(
        instance,
        transition,
        userId,
        comment || '',
        queryRunner,
      );

      await queryRunner.commitTransaction();

      // Créer nouvelle visite pour la nouvelle étape
      await this.getCurrentStageVisitEntity(instance);

      return this.findOne(instanceId);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
  * Exécuter une transition avec queryRunner (version unifiée)
  */
  /**
  * Exécuter une transition avec queryRunner
  * Crée automatiquement une nouvelle StageVisit pour la nouvelle étape
  */
  private async executeTransitionWithQueryRunner(
    instance: ProcedureInstance,
    transition: Transition,
    userId: string,
    comment: string,
    queryRunner: any,
  ): Promise<void> {
    // 1. Enregistrer la décision
    const decision = {
      instanceId: instance.id,
      fromStageId: transition.fromStageId,
      toStageId: transition.toStageId,
      userId,
      comment,
    };
    await queryRunner.manager.save('decisions', decision);

    // 2. Historique : Sortie de l'étape actuelle
    await queryRunner.manager.save(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_EXIT,
      stageId: transition.fromStageId,
      userId,
      metadata: { 
        transitionId: transition.id, 
        comment,
        type: transition.type 
      },
    });

    // 3. Mettre à jour l'étape courante de l'instance
    await queryRunner.manager.update(ProcedureInstance, instance.id, {
      currentStageId: transition.toStageId,
    });

    // 4. Créer une NOUVELLE StageVisit pour la nouvelle étape
    const newVisitNumber = await this.getNextVisitNumber(instance.id, transition.toStageId);

    const newStageVisit = this.stageVisitRepository.create({
      instanceId: instance.id,
      stageId: transition.toStageId,
      visitNumber: newVisitNumber,
      completedSubStages: [],
      subStageMetadata: {},
      enteredAt: new Date(),
      subStageVisits: [],
    });

    await queryRunner.manager.save(newStageVisit);

    // 5. Historique : Entrée dans la nouvelle étape
    await queryRunner.manager.save(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_ENTER,
      stageId: transition.toStageId,
      userId,
      metadata: { 
        transitionId: transition.id, 
        visitNumber: newVisitNumber,
        stageVisitId: newStageVisit.id 
      },
    });
  }

  /**
 * Retourne le prochain numéro de visite pour une étape donnée
 */
private async getNextVisitNumber(instanceId: string, stageId: string): Promise<number> {
  const count = await this.stageVisitRepository.count({
    where: { instanceId, stageId }
  });
  return count + 1;
}

/**
 * Traiter les inputs utilisateur
 */
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

      case 'select':
        // Vérifier que la valeur est dans les options
        const isValidOption = input.options?.some(opt => opt.value === value);
        if (input.required && !isValidOption) {
          throw new BadRequestException(`La valeur "${value}" n'est pas valide pour "${input.label}"`);
        }
        processed[input.name] = value;
        break;

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

    if (!currentStageFromTemplate || !currentStageFromTemplate.subStages?.length) {
      console.log(`[Auto Transition] Étape ou sous-étapes non trouvées dans le template`);
      return;
    }

    // ✅ Vérifier les sous-étapes obligatoires
    const mandatorySubStages = currentStageFromTemplate.subStages;
    // const mandatorySubStages = currentStageFromTemplate.subStages.filter(ss => ss.isMandatory);
    
    const allMandatoryCompleted = mandatorySubStages.length === 0 || 
      mandatorySubStages.every(mandatorySubStage => 
        currentStageVisit.subStageVisits?.some(visit => 
          visit.subStageId === mandatorySubStage.id && visit.isCompleted === true
        )
      );

    if (!allMandatoryCompleted) {
      console.log(`[Auto Transition] Transition bloquée : toutes les sous-étapes obligatoires ne sont pas encore complétées`);
      return;
    }

    console.log(`[Auto Transition] Toutes les sous-étapes obligatoires sont complétées → recherche de transitions automatiques`);

    // ✅ Récupérer les transitions automatiques depuis l'étape courante
    const automaticTransitions = await this.transitionRepository.find({
      where: {
        fromStageId: currentStageVisit.stageId,
        type: TransitionType.AUTOMATIC,
      },
      relations: ['fromStage', 'toStage'],
    });

    if (automaticTransitions.length === 0) {
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
            data: instance.data,
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
        if (!currentStageVisit.exitedAt) {
          currentStageVisit.exitedAt = new Date();
          await runner.manager.save(currentStageVisit);
        }

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

    if (!useExistingRunner && automaticTransitions.length === 0) {
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
async getAvailableTransitionsWithInputs(instanceId: string): Promise<(Transition & { expectsUserInput: boolean; userInputs?: any[] })[]> {
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
          data: instance.data,
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
async getCurrentStageVisit(instanceId: string): Promise<StageVisit> {
    const instance = await this.findOne(instanceId);

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

    let visit = await this.stageVisitRepository.findOne({
      where: { instanceId, stageId: instance.currentStageId },
      order: { visitNumber: 'DESC' },
      relations: ['subStageVisits', 'currentSubStageVisit', 'currentSubStageVisit.subStage'],
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
 * Réinitialiser une instance de procédure comme à la création
 * @param instanceId - ID de l'instance à réinitialiser
 * @param userId - ID de l'utilisateur effectuant la réinitialisation
 * @param options - Options de réinitialisation
 */
async resetInstance(
  instanceId: string,
  userId: string,
  options?: {
    keepTitle?: boolean;
    keepData?: boolean;
    keepHistory?: boolean;
    reason?: string;
  }
): Promise<ProcedureInstance> {
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
    const originalData = instance.data;
    
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

    // Gestion des données métier
    if (options?.keepData) {
      resetData.data = {
        ...originalData,
        _resetInfo: {
          resetAt: new Date(),
          resetBy: userId,
          previousData: originalData,
          reason: options?.reason,
        }
      };
    } else {
      resetData.data = {
        ...(originalData?.clientName ? { clientName: originalData.clientName } : {}),
        _resetInfo: {
          resetAt: new Date(),
          resetBy: userId,
          reason: options?.reason,
        }
      };
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
async resetInstanceSimple(
    instanceId: string,
    userId: string,
    reason?: string
): Promise<ProcedureInstance> {
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
            updatedAt: new Date(),
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
async completeAllSubStagesInCurrentStage(
  instanceId: string,
  userId: string,
  options?: {
    notes?: string;
    skipAutoTransitions?: boolean;
    forceComplete?: boolean; // Force la complétion même si déjà complétées
  }
): Promise<ProcedureInstance> {
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
async completeAllSubStagesInStage(
  instanceId: string,
  stageId: string,
  userId: string,
  options?: {
    notes?: string;
    skipAutoTransitions?: boolean;
    forceComplete?: boolean;
  }
): Promise<ProcedureInstance> {
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
async completeAllSubStagesInAllStages(
  instanceId: string,
  userId: string,
  options?: {
    notes?: string;
    skipAutoTransitions?: boolean;
    finalStageId?: string; // Optionnel: ID de l'étape finale à atteindre
  }
): Promise<ProcedureInstance> {
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
    userId: string,
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

    // Vérifier si l'utilisateur peut compléter des sous-étapes dans cette étape
    const canCompleteSubStages = this.canCompleteSubStagesInStage(instance, targetStage);

    // Enregistrer dans l'historique la consultation
    await this.historyService.log(
      instance.id,
      EventType.DECISION,
      stageId,
      userId,
      { 
        action: 'navigate_to_stage',
        fromStageId: instance.currentStageId,
        isTemporary: true,
        canCompleteSubStages,
      },
    );

    return {
      instance,
      targetStage,
      canCompleteSubStages,
    };
  }

  /**
  * Vérifie si l'utilisateur peut compléter des sous-étapes dans une étape spécifique
  * Règles:
  * - L'étape doit être avant l'étape courante (déjà passée) OU
  * - L'étape est l'étape courante
  */
  private canCompleteSubStagesInStage(
    instance: ProcedureInstance, 
    targetStage: Stage
  ): boolean {
    if (!instance.template?.stages) return false;
    
    const sortedStages = [...instance.template.stages].sort((a, b) => a.order - b.order);
    const currentStageIndex = sortedStages.findIndex(s => s.id === instance.currentStageId);
    const targetStageIndex = sortedStages.findIndex(s => s.id === targetStage.id);
    
    // On peut compléter des sous-étapes si c'est l'étape courante OU une étape passée
    // (pour permettre de revenir en arrière et compléter des optionnelles)
    return targetStageIndex <= currentStageIndex;
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
async completeSubStageInPreviousStage(
  instanceId: string,
  subStageId: string,
  stageId: string,
  userId: string,
  notes?: string,
): Promise<ProcedureInstance> {
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