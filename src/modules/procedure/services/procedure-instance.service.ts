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
  userId: string
): Promise<ProcedureInstance> {
  try {
    // 1. Récupérer l'instance sans lock
    const instance = await this.findOne(instanceId);
    
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${instanceId} not found`);
    }
    
    // Vérifier que la sous-étape n'est pas déjà complétée
    if (instance.completedSubStages?.includes(subStageId)) {
      throw new BadRequestException('SubStage already completed');
    }
    
    // 2. Vérifier que la sous-étape appartient au stage courant
    const currentStage = instance.currentStage;
    const subStage = currentStage?.subStages?.find(ss => ss.id === subStageId);
    
    if (!subStage) {
      throw new BadRequestException('SubStage not found in current stage');
    }
    
    // 3. Ajouter à la liste des sous-étapes complétées
    const completedSubStages = [...(instance.completedSubStages || []), subStageId];
    
    // Mise à jour directe sans transaction
    await this.instanceRepository.update(instance.id, {
      completedSubStages,
    });
    
    // 4. Enregistrer dans l'historique
    await this.historyService.log(
      instanceId,
      EventType.SUBSTAGE_COMPLETED,
      instance.currentStageId,
      userId,
      { subStageId, subStageName: subStage.name }
    );
    
    // 5. Vérifier si toutes les sous-étapes obligatoires sont complétées
    const mandatorySubStages = currentStage.subStages.filter(ss => ss.isMandatory);
    const allMandatoryCompleted = mandatorySubStages.every(ss => 
      completedSubStages.includes(ss.id)
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
  
  for (const transition of automaticTransitions) {
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
   * Déclencher les transitions automatiques (sans transaction imbriquée)
   */
private async triggerAutomaticTransitions(
    instance: ProcedureInstance,
    queryRunner: any,
    userId: string
  ): Promise<void> {
    const automaticTransitions = await this.transitionRepository.find({
    where: {
        fromStageId: instance.currentStageId,
        type: TransitionType.AUTOMATIC, // Use the enum value
    },
    });
    
    for (const transition of automaticTransitions) {
      // Évaluer la condition si présente
      let shouldTrigger = true;
      if (transition.triggerCondition) {
        const context = {
          instance: {
            data: instance.data,
            completedSubStages: instance.completedSubStages,
          },
        };
        shouldTrigger = await this.workflowService.evaluateCondition(transition.triggerCondition, context);
      }
      
      if (shouldTrigger) {
        // Exécuter la transition
        await this.executeTransition(
          instance,
          transition,
          userId,
          queryRunner
        );
      }
    }
  }


    /**
   * Exécuter une transition (sans transaction imbriquée)
   */
  private async executeTransition(
    instance: ProcedureInstance,
    transition: any,
    userId: string,
    queryRunner: any
  ): Promise<void> {
    // Enregistrer la décision
    const decision = {
      instanceId: instance.id,
      fromStageId: transition.fromStageId,
      transitionId: transition.id,
      toStageId: transition.toStageId,
      userId,
      comment: 'Transition automatique',
    };
    await queryRunner.manager.save('decisions', decision);
    
    // Quitter le stage courant
    await queryRunner.manager.save(HistoryEntry, {
      instanceId: instance.id,
      eventType: EventType.STAGE_EXIT,
      stageId: transition.fromStageId,
      userId,
      metadata: { transitionId: transition.id, type: 'automatic' },
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
      metadata: { transitionId: transition.id },
    });
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
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const instance = await this.findOne(instanceId);
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
      
      // Vérifier le nombre maximum de retours
      const usedCount = (instance.cycleUsageCount?.[cycleId] || 0);
      if (cycle.maxLoops && usedCount >= cycle.maxLoops) {
        throw new BadRequestException(
          `Maximum loop count (${cycle.maxLoops}) reached for this cycle`
        );
      }
      
      // Évaluer la condition du cycle (si présente)
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
      
      // Mettre à jour le compteur
      instance.cycleUsageCount = {
        ...(instance.cycleUsageCount || {}),
        [cycleId]: usedCount + 1,
      };
      await queryRunner.manager.save(instance);
      
      // Quitter l'étape courante
      await this.historyService.log(
        instanceId,
        EventType.STAGE_EXIT,
        instance.currentStageId,
        userId,
        { cycleId, reason: 'cycle_applied', label: cycle.label }
      );
      
      // Entrer dans la nouvelle étape
      instance.currentStageId = cycle.toStageId;
      await queryRunner.manager.save(instance);
      
      await this.historyService.log(
        instanceId,
        EventType.STAGE_ENTER,
        cycle.toStageId,
        userId,
        { cycleId, fromStage: cycle.fromStageId, label: cycle.label }
      );
      
      // Enregistrer comme décision spéciale
      await this.historyService.log(
        instanceId,
        EventType.CYCLE_APPLIED,
        cycle.toStageId,
        userId,
        { cycleId, fromStageId: cycle.fromStageId, toStageId: cycle.toStageId, label: cycle.label }
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
        'history',
      ],
    });
    
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${id} not found`);
    }
    
    if (!instance.completedSubStages) instance.completedSubStages = [];
    if (!instance.cycleUsageCount) instance.cycleUsageCount = {};
    
    return instance;
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

    // Calculer la progression
    const totalMandatorySubStages = instance.template.stages.reduce(
      (acc, stage) => acc + stage.subStages.filter(ss => ss.isMandatory).length, 0
    );
    const progress = totalMandatorySubStages > 0 
      ? Math.round((instance.completedSubStages.length / totalMandatorySubStages) * 100)
      : 0;

    return {
      instance,
      currentStage: instance.currentStage,
      availableTransitions,
      availableCycles,
      progress,
      completedSubStages: instance.completedSubStages,
      cycleUsageCount: instance.cycleUsageCount,
      history: instance.history,
      tasks: instance.tasks,
    };
  }
}