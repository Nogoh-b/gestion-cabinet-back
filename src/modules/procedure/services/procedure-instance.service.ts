// services/procedure-instance.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { Stage } from '../entities/stage.entity';
import { SubStage } from '../entities/sub-stage.entity';
import { Transition } from '../entities/transition.entity';
import { Cycle } from '../entities/cycle.entity';
import { ProcedureTemplateService } from './procedure-template.service';
import { WorkflowService } from './workflow.service';
import { HistoryService } from './history.service';
import { CreateProcedureInstanceDto } from '../dto/create-procedure-instance.dto';
import { EventType, InstanceStatus, TransitionType } from '../entities/enums/instance-status.enum';
import { HistoryEntry } from '../entities/history-entry.entity';
import { InstanceMapperService } from './instance-sub-stage.service';
import { MappedInstance } from '../entities/type/instance-status.enum';

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

  ) {}

  async create(dto: CreateProcedureInstanceDto, userId: string): Promise<ProcedureInstance> {
    const template = await this.templateService.findOne(dto.templateId);

    if (!template.stages || template.stages.length === 0) {
      throw new Error('Template has no stages');
    }

    // Trier les stages par ordre
    const firstStage = template.stages.sort((a, b) => a.order - b.order)[0];

    const instance = this.instanceRepository.create({
      templateId: dto.templateId,
      title: dto.title,
      status: InstanceStatus.ACTIVE,
      currentStageId: firstStage.id,
      data: dto.data || {},
      completedSubStages: [], // Tableau des IDs des sous-étapes complétées
      cycleUsageCount: {},    // Compteur des utilisations de cycles
    });

    await this.instanceRepository.save(instance);

    // Enregistrer l'entrée dans le premier stage
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
  skipAutoTransitions: boolean = false, // Ajout du paramètre
): Promise<ProcedureInstance> {
  try {
    // 1. Récupérer l'instance sans lock
    const instance = await this.findOne(instanceId);
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${instanceId} not found`);
    }
    
    
    // Vérifier si déjà complétée
    if (instance.completedSubStages?.includes(subStageId)) {
      throw new BadRequestException('SubStage already completed');
    }
    
    // Ajouter aux complétées
    instance.completedSubStages = [...(instance.completedSubStages || []), subStageId];
    
    // Mettre à jour les métadonnées
    if (!instance.subStageMetadata) {
      instance.subStageMetadata = {};
    }
    
    instance.subStageMetadata[subStageId] = {
      ...instance.subStageMetadata[subStageId],
      completedAt: new Date().toISOString(),
      notes: notes || instance.subStageMetadata[subStageId]?.notes,
    };
    
    await this.instanceRepository.save(instance);
    
    await this.historyService.log(
      instanceId,
      EventType.SUBSTAGE_COMPLETED,
      null,
      userId,
      { subStageId, notes },
    );
    
    // Vérifier les transitions automatiques
    // await this.checkAndTriggerAutomaticTransitions(instanceId,userId);
    
    // 2. Vérifier que la sous-étape appartient au stage courant
    const currentStage = instance.currentStage;


    // 5. Vérifier si toutes les sous-étapes obligatoires sont complétées
    const mandatorySubStages = currentStage.subStages.filter(ss => ss.isMandatory);
    const allMandatoryCompleted = mandatorySubStages.every(ss => 
      instance.completedSubStages.includes(ss.id)
    );

    console.log(mandatorySubStages, ' ', allMandatoryCompleted)
    
    // 6. Si toutes les sous-étapes sont complétées, déclencher les transitions auto
    if (allMandatoryCompleted) {
      await this.triggerAutomaticTransitionsSimple(instance, userId);
    }
    
    // Retourner l'instance mise à jour
    return this.findOne(instanceId);
    
  } catch (error) {
    console.error('Error in completeSubStage:', error);
    throw error;
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
  async getAvailableTransitions(instanceId: string): Promise<Transition[]> {
    const instance = await this.findOne(instanceId);
    
    const transitions = await this.transitionRepository.find({
      where: {
        fromStageId: instance.currentStageId,
        type: TransitionType.MANUAL,
      },
    });
    
    const available: Transition[] = [];
    for (const transition of transitions) {
      if (transition.condition) {
        const context = {
          instance: { 
            data: instance.data, 
            completedSubStages: instance.completedSubStages 
          },
        };
        if (await this.workflowService.evaluateCondition(transition.condition, context)) {
          available.push(transition);
        }
      } else {
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
        'template.stages.subStages',
        'template.stages.config',
        'currentStage',
        'currentStage.subStages',
        'decisions',
        'tasks',
        // 'history',
      ],
    });
    
    if (!instance) {
      throw new NotFoundException(`Instance with ID - ${id} not found`);
    }
    
    if (!instance.completedSubStages) instance.completedSubStages = [];
    if (!instance.cycleUsageCount) instance.cycleUsageCount = {};
    
    return instance;
  }

  async findOneMapped(id: string): Promise<MappedInstance> {
    const instance = await this.findOne(id);
    // const currentTemplate = await this.templateService.findOne(instance.templateId);
    
    return this.instanceMapper.mapInstanceWithCurrentTemplate(instance, instance.template);
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
    const availableTransitions = await this.workflowService.getAvailableTransitions(id);
    const availableCycles = await this.getAvailableCycles(id);
    const mapped = this.instanceMapper.mapInstanceWithCurrentTemplate(instance, instance.template);
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
      stages: mapped.stages,
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
    //   history: instance.history,
      tasks: instance.tasks,
    };
  }



 /**
   * Démarrer une sous-étape
   */
  async startSubStage(
    instanceId: string,
    subStageId: string,
    userId: string,
    notes?: string,
  ): Promise<ProcedureInstance> {
    const instance = await this.findOne(instanceId);
    
    // Initialiser les métadonnées si nécessaire
    if (!instance.subStageMetadata) {
      instance.subStageMetadata = {};
    }
    
    instance.subStageMetadata[subStageId] = {
      ...instance.subStageMetadata[subStageId],
      startedAt: new Date().toISOString(),
      notes: notes || instance.subStageMetadata[subStageId]?.notes,
    };
    
    await this.instanceRepository.save(instance);
    
    await this.historyService.log(
      instanceId,
      EventType.SUBSTAGE_STARTED,
      null,
      userId,
      { subStageId, notes },
    );
    
    return instance;
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
 * Appliquer une transition manuelle (avec gestion des inputs utilisateur)
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
    // 1. Récupérer l'instance et la transition
    const instance = await this.findOne(instanceId);
    const transition = await this.transitionRepository.findOne({
      where: { id: transitionId },
      relations: ['fromStage', 'toStage'],
    });

    if (!transition) {
      throw new NotFoundException('Transition non trouvée');
    }

    // 2. Vérifier que c'est une transition manuelle
    if (transition.type !== TransitionType.MANUAL) {
      throw new BadRequestException('Cette transition ne peut pas être appliquée manuellement');
    }

    // 3. Vérifier que la transition est disponible depuis l'étape courante
    if (transition.fromStageId !== instance.currentStageId) {
      throw new BadRequestException('Cette transition n\'est pas disponible depuis l\'étape actuelle');
    }

    // 4. Vérifier la condition de la transition (si présente)
    if (transition.condition) {
      const context = {
        instance: {
          data: instance.data,
          completedSubStages: instance.completedSubStages,
        },
      };
      const conditionMet = await this.workflowService.evaluateCondition(
        transition.condition,
        context,
      );
      if (!conditionMet) {
        throw new BadRequestException('Les conditions de la transition ne sont pas remplies');
      }
    }

    const currentStage = instance.currentStage;
    const mandatorySubStages = currentStage.subStages.filter(ss => ss.isMandatory);
    const allMandatoryCompleted = mandatorySubStages.every(ss => 
      instance.completedSubStages.includes(ss.id)
    );
    
    if (!allMandatoryCompleted) {
      throw new BadRequestException(
        'Toutes les sous-étapes obligatoires doivent être complétées avant de continuer'
      );
    }

    // 5. Traiter les inputs utilisateur (si la transition en attend)
    let processedInputs: Record<string, any> = {};
    if (transition.expectsUserInput && transition.userInputs?.length > 0) {
      processedInputs = await this.processUserInputs(
        transition,
        userInputs || {},
        queryRunner,
        instance,
      );
    }

    // 6. Mettre à jour les données de l'instance avec les inputs
    if (Object.keys(processedInputs).length > 0) {
      instance.data = {
        ...instance.data,
        ...processedInputs,
        _transitionHistory: {
          ...instance.data?._transitionHistory,
          [transition.id]: {
            appliedAt: new Date(),
            inputs: processedInputs,
            comment,
          },
        },
      };
      await queryRunner.manager.save(instance);
    }

    // 7. Exécuter la transition (en utilisant votre méthode existante)
    await this.executeTransitionWithQueryRunner(
      instance,
      transition,
      userId,
      comment || '',
      queryRunner,
    );

    await queryRunner.commitTransaction();

    // 8. Déclencher les transitions automatiques de la nouvelle étape
    // await this.checkAndTriggerAutomaticTransitions(instance.id, userId); 

    return this.findOne(instance.id);
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
private async executeTransitionWithQueryRunner(
  instance: ProcedureInstance,
  transition: Transition,
  userId: string,
  comment: string | null,
  queryRunner: any,
): Promise<void> {
  // Enregistrer la décision
  const decision = {
    instanceId: instance.id,
    fromStageId: transition.fromStageId,
    transitionId: transition.id,
    toStageId: transition.toStageId,
    userId,
    comment: comment || (transition.type === TransitionType.AUTOMATIC ? 'Transition automatique' : transition.label),
  };
  await queryRunner.manager.save('decisions', decision);

  // Quitter le stage courant
  await queryRunner.manager.save(HistoryEntry, {
    instanceId: instance.id,
    eventType: EventType.STAGE_EXIT,
    stageId: transition.fromStageId,
    userId,
    metadata: { transitionId: transition.id, type: transition.type, comment },
  });

  // Entrer dans le nouveau stage
  await queryRunner.manager.update(ProcedureInstance, instance.id, {
    currentStageId: transition.toStageId,
  });

  await queryRunner.manager.save(HistoryEntry, {
    instanceId: instance.id,
    eventType: EventType.STAGE_ENTER,
    stageId: transition.toStageId,
    userId,
    metadata: { transitionId: transition.id, fromStage: transition.fromStageId },
  });
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
private async checkAndTriggerAutomaticTransitions(
  instanceId: string,
  userId: string,
): Promise<void> {
  const instance = await this.findOne(instanceId);
  const automaticTransitions = await this.transitionRepository.find({
    where: {
      fromStageId: instance.currentStageId,
      type: TransitionType.AUTOMATIC,
    },
  });

  for (const transition of automaticTransitions) {
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
        context,
      );
    }

    if (shouldTrigger) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await this.executeTransitionWithQueryRunner(
          instance,
          transition,
          userId,
          'Transition automatique déclenchée',
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
 * Réinitialiser une instance (version simplifiée)
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

        // Enregistrer la réinitialisation
        await this.historyService.log(
            instance.id,
            EventType.DECISION,
            instance.currentStageId,
            userId,
            { action: 'reset', reason, toStage: firstStage.id },
            
        );

        // Réinitialiser
        await queryRunner.manager.update(ProcedureInstance, instance.id, {
            status: InstanceStatus.ACTIVE,
            currentStageId: firstStage.id,
            completedSubStages: [],
            cycleUsageCount: {},
        });

        // Enregistrer l'entrée
        await this.historyService.log(
            instance.id,
            EventType.STAGE_ENTER,
            firstStage.id,
            userId,
            { message: 'Instance réinitialisée', reason },
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
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId);
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
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId);
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
      await this.checkAndTriggerAutomaticTransitions(instanceId, userId);
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

}