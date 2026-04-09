// services/workflow.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { Stage } from '../entities/stage.entity';
import { Transition } from '../entities/transition.entity';
import { Decision } from '../entities/decision.entity';
import { TransitionResult } from '../interfaces/transition-result.interface';
import { HistoryEntry } from '../entities/history-entry.entity';
import { EventType, TransitionType } from '../entities/enums/instance-status.enum';
import { ApplyTransitionDto } from '../dto/create-procedure-instance.dto copy';
import * as jsonLogic from 'json-logic-js';
import { StageVisit } from '../entities/stage-visit.entity';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(ProcedureInstance)
    private instanceRepository: Repository<ProcedureInstance>,
    @InjectRepository(Stage)
    private stageRepository: Repository<Stage>,
    @InjectRepository(Transition)
    private transitionRepository: Repository<Transition>,
    @InjectRepository(Decision)
    private decisionRepository: Repository<Decision>,
    @InjectRepository(HistoryEntry)
    private historyRepository: Repository<HistoryEntry>,
    @InjectRepository(StageVisit)
    private stageVisitRepository: Repository<StageVisit>,
  ) {}

  /**
   * Récupère les transitions disponibles manuellement pour une instance
   */
  async getAvailableTransitions(instanceId: string): Promise<Transition[]> {
    const instance = await this.getInstanceWithRelations(instanceId);
    
    const transitions = await this.transitionRepository.find({
      where: {
        fromStageId: instance.currentStageId,
        type: TransitionType.MANUAL,
        requiresDecision: true,
      },
      relations: ['fromStage', 'toStage'],
    });

    // Filtrer selon les conditions
    const available: Transition[] = [];
    for (const transition of transitions) {
      if (await this.evaluateCondition(transition.condition, instance)) {
        available.push(transition);
      }
    }

    return available;
  }

  /**
   * Applique une transition manuelle (choix de l'utilisateur)
   */
  async applyManualTransition(
    instanceId: string,
    dto: ApplyTransitionDto,
    userId: string,
  ): Promise<TransitionResult> {
    const transition = await this.transitionRepository.findOne({
      where: { id: dto.transitionId },
      relations: ['fromStage', 'toStage'],
    });

    if (!transition) {
      throw new NotFoundException('Transition not found');
    }

    if (transition.type !== TransitionType.MANUAL) {
      throw new BadRequestException('This transition cannot be applied manually');
    }

    const instance = await this.getInstanceWithRelations(instanceId);

    if (instance.currentStageId !== transition.fromStageId) {
      throw new BadRequestException('Invalid transition for current stage');
    }

    return this.executeTransition(instance, transition, userId, dto?.comment);
  }



  /**
   * Exécute une transition (cœur du workflow)
   */
  private async executeTransition(
    instance: ProcedureInstance,
    transition: Transition,
    userId: string | null,
    comment?: string | null,
    eventData?: any,
  ): Promise<TransitionResult> {
    // 1. Enregistrer la décision (si utilisateur)
    if (userId) {
      const decision = this.decisionRepository.create({
        instanceId: instance.id,
        fromStageId: transition.fromStageId,
        // transitionId: transition.id,
        toStageId: transition.toStageId,
        userId,
        comment,
      });
      await this.decisionRepository.save(decision);
    }

    // 2. Quitter le stage courant
    await this.historyRepository.save({
      instanceId: instance.id,
      eventType: EventType.STAGE_EXIT,
      stageId: transition.fromStageId,
      userId: userId || 'system',
      metadata: { transitionId: transition.id, eventData },
    });

    // 3. Entrer dans le nouveau stage
    const newStage = await this.stageRepository.findOne({
      where: { id: transition.toStageId },
    });

    instance.currentStageId = transition.toStageId;
    await this.instanceRepository.save(instance);

    await this.historyRepository.save({
      instanceId: instance.id,
      eventType: EventType.STAGE_ENTER,
      stageId: transition.toStageId,
      userId: userId || 'system',
      metadata: { transitionId: transition.id },
    });

    // 4. Exécuter les actions post-transition
    if (transition.onTransition) {
      await this.executePostTransitionActions(instance, transition.onTransition);
    }

    return {
      success: true,
      fromStage: transition.fromStage,
      toStage: transition.toStage,
      transition,
    };
  }



  /**
   * Exécute les actions post-transition
   */
  private async executePostTransitionActions(
    instance: ProcedureInstance,
    actions: any,
  ): Promise<void> {
    // Implémentation des actions (création de tâches, notifications, etc.)
    // Exemple d'action: { "createTask": { "title": "Nouvelle tâche", "dueDays": 7 } }
  }

  /**
   * Récupère une instance avec ses relations
   */
  private async getInstanceWithRelations(id: string): Promise<ProcedureInstance> {
    const instance = await this.instanceRepository.findOne({
      where: { id },
      relations: ['template', 'currentStage',  'currentStage.subStages','decisions', 'history'],
    });
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${id} not found`);
    }
    return instance;
  }

  /**
   * Évalue une condition stockée en JSON
   */
    async evaluateCondition(condition: any, context: any): Promise<boolean> {
        if (!condition) return true;
        
        try {
        // Préparer les variables pour jsonLogic
        const vars: any = {};
        
        if (context.instance) {
            vars['instance'] = {
            data: context.instance.data,
            completedSubStages: context.instance.completedSubStages,
            };
        }
        
        if (context.subStage) {
            vars['subStage'] = context.subStage;
        }  

        if (context.stageVisit) {
            vars['stageVisit'] = context.stageVisit;
        }
        
        if (context.stage) {
            vars['stage'] = context.stage;
        }
        if (context.event) {
            vars['event'] = context.event;
        }
        
        // Vérifier si jsonLogic est défini
        if (!jsonLogic || typeof jsonLogic.apply !== 'function') {
            console.warn('jsonLogic not properly loaded, returning true for condition');
            return true;
        }
        
        // Utiliser json-logic-js pour évaluer
        return jsonLogic.apply(condition, vars);
        } catch (error) {
        console.error('Error evaluating condition:', error);
        console.error('Condition:', JSON.stringify(condition));
        console.error('Context:', JSON.stringify(context));
        return false;
        }
    }

    // Exemple de méthode de migration (à appeler une seule fois)
async migrateToStageVisits() {
  const instances = await this.instanceRepository.find({
    relations: ['template', 'template.stages', 'template.stages.subStages']
  });

  for (const instance of instances) {
    if (!instance.currentStageId) continue;

    const visit = this.stageVisitRepository.create({
      instanceId: instance.id,
      stageId: instance.currentStageId,
      visitNumber: 1,
      completedSubStages: instance.completedSubStages || [],
      subStageMetadata: instance.subStageMetadata || {},
      enteredAt: instance.createdAt,
    });

    await this.stageVisitRepository.save(visit);
  }

  console.log('Migration des StageVisit terminée');
}

// Modifier triggerAutomaticTransitions pour accepter queryRunner
async triggerAutomaticTransitions(
  instance: ProcedureInstance,
  eventType: EventType,
  eventData: any,
  queryRunner?: any,
  userId?: string
): Promise<TransitionResult[]> {
  const results: TransitionResult[] = [];

  const automaticTransitions = await this.transitionRepository.find({
    where: {
      fromStageId: instance.currentStageId,
      type: TransitionType.AUTOMATIC,
      triggerEvent: eventType,
    },
    relations: ['fromStage', 'toStage'],
  });

  for (const transition of automaticTransitions) {
    const context = {
      instance: { 
        data: instance.data, 
        completedSubStages: instance.completedSubStages 
      },
      eventType,
      eventData,
    };

    if (await this.evaluateCondition(transition.triggerCondition, context)) {
      const result = await this.executeTransitionWithQueryRunner(
        instance,
        transition,
        userId || 'system',
        null,
        eventData,
        queryRunner
      );
      results.push(result);
    }
  }

  return results;
}

// Ajouter méthode avec queryRunner pour les transactions
private async executeTransitionWithQueryRunner(
  instance: ProcedureInstance,
  transition: Transition,
  userId: string,
  comment: string | null,
  eventData: any,
  queryRunner?: any
): Promise<TransitionResult> {
  const repo = queryRunner || this.instanceRepository;
  
  // Enregistrer la décision
  const decision = this.decisionRepository.create({
    instanceId: instance.id,
    fromStageId: transition.fromStageId,
    // transitionId: transition.id,
    toStageId: transition.toStageId,
    userId,
    comment,
  });
  await repo.manager.save(decision);

  // Quitter le stage courant
  await this.historyRepository.save({
    instanceId: instance.id,
    eventType: EventType.STAGE_EXIT,
    stageId: transition.fromStageId,
    userId,
    metadata: { transitionId: transition.id, eventData },
  });

  // Entrer dans le nouveau stage
  instance.currentStageId = transition.toStageId;
  await repo.manager.save(instance);

  await this.historyRepository.save({
    instanceId: instance.id,
    eventType: EventType.STAGE_ENTER,
    stageId: transition.toStageId,
    userId,
    metadata: { transitionId: transition.id },
  });

  return {
    success: true,
    fromStage: transition.fromStage,
    toStage: transition.toStage,
    transition,
  };
}

}