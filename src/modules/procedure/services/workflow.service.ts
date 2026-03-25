// services/workflow.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { Stage } from '../entities/stage.entity';
import { Transition } from '../entities/transition.entity';
import { Decision } from '../entities/decision.entity';
import { WorkflowContext } from '../interfaces/workflow-context.interface';
import { TransitionResult } from '../interfaces/transition-result.interface';
import { HistoryEntry } from '../entities/history-entry.entity';
import { EventType, TransitionType } from '../entities/enums/instance-status.enum';
import { ApplyTransitionDto } from '../dto/create-procedure-instance.dto copy';

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

    return this.executeTransition(instance, transition, userId, dto.comment);
  }

  /**
   * Déclenche les transitions automatiques basées sur un événement
   */
  async triggerAutomaticTransitions(
    instanceId: string,
    eventType: EventType,
    eventData: any,
  ): Promise<TransitionResult[]> {
    const instance = await this.getInstanceWithRelations(instanceId);
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
      const context: WorkflowContext = {
        instance,
        eventType,
        eventData,
      };

      if (await this.evaluateCondition(transition.triggerCondition, context)) {
        const result = await this.executeTransition(
          instance,
          transition,
          null,
          null,
          eventData,
        );
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Exécute une transition (cœur du workflow)
   */
  private async executeTransition(
    instance: ProcedureInstance,
    transition: Transition,
    userId: string | null,
    comment: string | null,
    eventData?: any,
  ): Promise<TransitionResult> {
    // 1. Enregistrer la décision (si utilisateur)
    if (userId) {
      const decision = this.decisionRepository.create({
        instanceId: instance.id,
        fromStageId: transition.fromStageId,
        transitionId: transition.id,
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
   * Évalue une condition stockée en JSON
   */
  private async evaluateCondition(
    condition: any,
    context: WorkflowContext | ProcedureInstance,
  ): Promise<boolean> {
    if (!condition) {
      return true;
    }

    // Condition peut être une expression simple ou un objet JSON Logic
    // Exemple: { "==": [{ "var": "instance.data.montant" }, 10000] }
    
    try {
      // Implémentation simplifiée - à adapter selon vos besoins
      if (typeof condition === 'string') {
        // Évaluation d'expression simple (à remplacer par un vrai parser)
        return true;
      }
      
      // Pour JSON Logic, utiliser une lib comme 'json-logic-js'
      return true;
    } catch (error) {
      return false;
    }
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
      relations: ['template', 'currentStage', 'decisions', 'history'],
    });
    if (!instance) {
      throw new NotFoundException(`Instance with ID ${id} not found`);
    }
    return instance;
  }
}