import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'src/core/enums/user-role.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Diligence,
  DiligencePriority,
  DiligenceStatus,
  DiligenceType,
} from 'src/modules/diligence/entities/diligence.entity';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ActionLinkRole,
  ActionPriority,
  DossierActionStatus,
  DossierLifecyclePhase,
  RecommendationStatus,
  RecommendationTrigger,
  WorkflowEngine,
} from '../case-workflow.enums';
import {
  ActionTransitionDto,
  CompleteDossierActionDto,
  CreateDossierActionDto,
  DeferRecommendationDto,
  ExtendDossierActionDeadlineDto,
  UpdateDossierActionDetailsDto,
} from '../dto/case-workflow.dto';
import { ActionDefinition } from '../entities/action-catalog.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../entities/dossier-action.entity';
import { DossierRecommendation } from '../entities/recommendation.entity';
import { BillableItem } from '../entities/billing.entity';
import { CaseWorkflowEvent } from '../entities/workflow-audit.entity';
import { CaseBillingService } from './case-billing.service';
import { RecommendationService } from './recommendation.service';
import { WorkflowEventService } from './workflow-event.service';
import {
  validateDeadlineExtension,
  validateDynamicPayload,
  validateRequiredRelations,
} from '../case-workflow.logic';

@Injectable()
export class DossierActionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DossierAction)
    private readonly actionRepository: Repository<DossierAction>,
    @InjectRepository(DossierRecommendation)
    private readonly recommendationRepository: Repository<DossierRecommendation>,
    private readonly recommendationService: RecommendationService,
    private readonly billingService: CaseBillingService,
    private readonly eventService: WorkflowEventService,
  ) {}

  private diligencePriority(priority: ActionPriority): DiligencePriority {
    if (priority === ActionPriority.CRITICAL) return DiligencePriority.CRITICAL;
    if (priority === ActionPriority.HIGH) return DiligencePriority.HIGH;
    if (priority === ActionPriority.LOW) return DiligencePriority.LOW;
    return DiligencePriority.MEDIUM;
  }

  /**
   * La diligence devient la vue personnelle/exécutable d'une action confiée.
   * Le lien unique rend l'opération idempotente et évite deux diligences pour
   * une même action en cas de nouvelle tentative réseau.
   */
  private async createLinkedDiligence(
    manager: EntityManager,
    action: DossierAction,
  ): Promise<void> {
    const repository = manager.getRepository(Diligence);
    const existing = await repository.findOne({
      where: {
        tenant_id: action.tenant_id,
        source_action_id: action.id,
      },
    });
    if (existing) return;

    const startDate = action.planned_at ?? new Date();
    const fallbackDeadline = new Date(startDate.getTime() + 7 * 86_400_000);
    await repository.save(
      repository.create({
        tenant_id: action.tenant_id,
        dossier_id: action.dossier_id,
        assigned_lawyer_id: action.responsible_user_id,
        source_action_id: action.id,
        title: action.title,
        description: `Diligence créée automatiquement depuis l’action « ${action.title} »`,
        type: DiligenceType.GENERAL,
        status:
          action.status === DossierActionStatus.IN_PROGRESS
            ? DiligenceStatus.IN_PROGRESS
            : DiligenceStatus.DRAFT,
        priority: this.diligencePriority(action.priority),
        start_date: startDate,
        deadline: action.due_at ?? fallbackDeadline,
        confidential: true,
      }),
    );
  }

  private async syncLinkedDiligence(
    manager: EntityManager,
    action: DossierAction,
  ): Promise<void> {
    const repository = manager.getRepository(Diligence);
    const diligence = await repository.findOne({
      where: {
        tenant_id: action.tenant_id,
        source_action_id: action.id,
      },
    });
    if (!diligence) return;

    diligence.title = action.title;
    diligence.assigned_lawyer_id = action.responsible_user_id;
    diligence.priority = this.diligencePriority(action.priority);
    if (action.due_at) diligence.deadline = action.due_at;
    if (action.status === DossierActionStatus.IN_PROGRESS) {
      diligence.status = DiligenceStatus.IN_PROGRESS;
    } else if (action.status === DossierActionStatus.COMPLETED) {
      diligence.status = DiligenceStatus.COMPLETED;
      diligence.completion_date = action.completed_at ?? new Date();
    } else if (action.status === DossierActionStatus.CANCELLED) {
      diligence.status = DiligenceStatus.CANCELLED;
    }
    await repository.save(diligence);
  }

  private async assertConfidentialDossierAccess(
    manager: EntityManager,
    dossierId: number,
    actorUserId: number,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    const dossier = await manager.getRepository(Dossier).findOne({
      where: { id: dossierId, tenant_id: tenantId },
      relations: ['lawyer', 'collaborators'],
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (!dossier.confidentiality_level) return;
    const actor = await manager.getRepository(User).findOne({
      where: { id: actorUserId, tenant_id: tenantId },
    });
    const assigned =
      dossier.lawyer_id === actorUserId ||
      dossier.lawyer?.id === actorUserId ||
      dossier.collaborators?.some(
        (collaborator) => collaborator.id === actorUserId,
      );
    if (actor?.role !== UserRole.ADMIN && !assigned) {
      throw new ForbiddenException(
        'Ce dossier confidentiel est réservé à ses membres affectés',
      );
    }
  }

  private validateSpecificData(
    schema: Record<string, any> | null,
    data: Record<string, unknown> | undefined,
    requiredProperty: 'required' | 'required_on_start' = 'required',
  ): void {
    const issue = validateDynamicPayload(schema, data, requiredProperty)[0];
    if (issue) throw new BadRequestException(issue.message);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    const candidate = error as {
      code?: string;
      errno?: number;
      driverError?: { code?: string; errno?: number };
    };
    return (
      candidate?.code === 'ER_DUP_ENTRY' ||
      candidate?.errno === 1062 ||
      candidate?.driverError?.code === 'ER_DUP_ENTRY' ||
      candidate?.driverError?.errno === 1062
    );
  }

  private async validateLinkedIds(
    manager: EntityManager,
    dossierId: number,
    dto:
      | CreateDossierActionDto
      | CompleteDossierActionDto
      | UpdateDossierActionDetailsDto,
    actorUserId: number,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    const [dossier, actor] = await Promise.all([
      manager.getRepository(Dossier).findOne({
        where: { id: dossierId, tenant_id: tenantId },
        relations: ['lawyer', 'collaborators'],
      }),
      manager.getRepository(User).findOne({
        where: { id: actorUserId, tenant_id: tenantId },
      }),
    ]);
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    const assigned =
      dossier.lawyer_id === actorUserId ||
      dossier.lawyer?.id === actorUserId ||
      dossier.collaborators?.some(
        (collaborator) => collaborator.id === actorUserId,
      );
    const canAccessConfidential = actor?.role === UserRole.ADMIN || assigned;
    if (dossier.confidentiality_level && !canAccessConfidential) {
      throw new ForbiddenException(
        'Ce dossier confidentiel est réservé à ses membres affectés',
      );
    }
    const documentIds = [
      ...new Set((dto.documents ?? []).map((item) => item.id)),
    ];
    if (documentIds.length) {
      const documents = await manager.getRepository(DocumentCustomer).find({
        where: {
          tenant_id: tenantId,
          dossier_id: dossierId,
          id: In(documentIds),
        },
      });
      if (documents.length !== documentIds.length)
        throw new BadRequestException(
          'Un document lié ne dépend pas de ce dossier ou de ce cabinet',
        );
      if (documents.some((document) => document.is_confidential)) {
        if (!canAccessConfidential) {
          throw new ForbiddenException(
            'Un document confidentiel ne peut être lié que par un membre affecté au dossier',
          );
        }
      }
    }
    const audienceIds = [
      ...new Set((dto.audiences ?? []).map((item) => item.id)),
    ];
    if (audienceIds.length) {
      const count = await manager.getRepository(Audience).count({
        where: {
          tenant_id: tenantId,
          dossier_id: String(dossierId),
          id: In(audienceIds),
        },
      });
      if (count !== audienceIds.length)
        throw new BadRequestException(
          'Une audience liée ne dépend pas de ce dossier ou de ce cabinet',
        );
    }
    if ('previous_actions' in dto) {
      const actionIds = [
        ...new Set((dto.previous_actions ?? []).map((item) => item.id)),
      ];
      if (actionIds.length) {
        const count = await manager.getRepository(DossierAction).count({
          where: {
            tenant_id: tenantId,
            dossier_id: dossierId,
            id: In(actionIds),
          },
        });
        if (count !== actionIds.length)
          throw new BadRequestException(
            'Une action précédente ne dépend pas de ce dossier',
          );
      }
    }
  }

  private async saveLinks(
    manager: EntityManager,
    action: DossierAction,
    dto:
      | CreateDossierActionDto
      | CompleteDossierActionDto
      | UpdateDossierActionDetailsDto,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (dto.documents?.length) {
      const repository = manager.getRepository(DossierActionDocumentLink);
      for (const link of dto.documents) {
        const exists = await repository.findOne({
          where: {
            tenant_id: tenantId,
            action_id: action.id,
            document_id: link.id,
            role: link.role,
          },
        });
        if (!exists)
          await repository.save(
            repository.create({
              tenant_id: tenantId,
              action_id: action.id,
              document_id: link.id,
              role: link.role,
              requires_review: false,
            }),
          );
      }
    }
    if (dto.audiences?.length) {
      const repository = manager.getRepository(DossierActionAudienceLink);
      for (const link of dto.audiences) {
        const exists = await repository.findOne({
          where: {
            tenant_id: tenantId,
            action_id: action.id,
            audience_id: link.id,
            role: link.role,
          },
        });
        if (!exists)
          await repository.save(
            repository.create({
              tenant_id: tenantId,
              action_id: action.id,
              audience_id: link.id,
              role: link.role,
              requires_review: false,
            }),
          );
      }
    }
    if ('previous_actions' in dto && dto.previous_actions?.length) {
      const repository = manager.getRepository(DossierActionRelation);
      for (const relation of dto.previous_actions) {
        const role = relation.role ?? ActionLinkRole.DEPENDS_ON;
        const exists = await repository.findOne({
          where: {
            tenant_id: tenantId,
            action_id: action.id,
            related_action_id: relation.id,
            role,
          },
        });
        if (!exists)
          await repository.save(
            repository.create({
              tenant_id: tenantId,
              action_id: action.id,
              related_action_id: relation.id,
              role,
            }),
          );
      }
    }
  }

  private async replaceActionInputs(
    manager: EntityManager,
    action: DossierAction,
    dto: UpdateDossierActionDetailsDto,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (dto.documents !== undefined) {
      if (dto.documents.some((link) => link.role !== ActionLinkRole.INPUT)) {
        throw new BadRequestException(
          'Seuls les documents d’entrée peuvent être modifiés avant la complétion',
        );
      }
      await manager.getRepository(DossierActionDocumentLink).delete({
        tenant_id: tenantId,
        action_id: action.id,
        role: ActionLinkRole.INPUT,
      });
    }
    if (dto.audiences !== undefined) {
      if (dto.audiences.some((link) => link.role !== ActionLinkRole.INPUT)) {
        throw new BadRequestException(
          'Seules les audiences d’entrée peuvent être modifiées avant la complétion',
        );
      }
      await manager.getRepository(DossierActionAudienceLink).delete({
        tenant_id: tenantId,
        action_id: action.id,
        role: ActionLinkRole.INPUT,
      });
    }
    if (dto.previous_actions !== undefined) {
      await manager.getRepository(DossierActionRelation).delete({
        tenant_id: tenantId,
        action_id: action.id,
        role: ActionLinkRole.DEPENDS_ON,
      });
    }
    await this.saveLinks(manager, action, dto);
  }

  private async validateCompletionRequirements(
    manager: EntityManager,
    action: DossierAction,
    dto: CompleteDossierActionDto,
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    const [documentLinks, audienceLinks, relationLinks] = await Promise.all([
      manager.getRepository(DossierActionDocumentLink).find({
        where: { tenant_id: tenantId, action_id: action.id },
      }),
      manager.getRepository(DossierActionAudienceLink).find({
        where: { tenant_id: tenantId, action_id: action.id },
      }),
      manager.getRepository(DossierActionRelation).find({
        where: { tenant_id: tenantId, action_id: action.id },
      }),
    ]);
    const issue = validateRequiredRelations(
      action.definition.required_relations,
      {
        documents: [
          ...documentLinks.map((link) => ({ role: link.role })),
          ...(dto.documents ?? []),
        ],
        audiences: [
          ...audienceLinks.map((link) => ({ role: link.role })),
          ...(dto.audiences ?? []),
        ],
        previous_actions: relationLinks.map((link) => ({ role: link.role })),
      },
    )[0];
    if (issue) throw new BadRequestException(issue);
  }

  async create(
    dossierId: number,
    dto: CreateDossierActionDto,
    idempotencyKey: string,
    actorUserId: number,
    autoStart = false,
  ): Promise<DossierAction> {
    const tenantId = getCurrentTenantId();
    const prior = await this.actionRepository.findOne({
      where: { tenant_id: tenantId, idempotency_key: idempotencyKey },
      relations: ['definition'],
    });
    if (prior) return prior;

    let action: DossierAction;
    try {
      action = await this.dataSource.transaction(async (manager) => {
        const dossier = await manager
          .getRepository(Dossier)
          .createQueryBuilder('dossier')
          .setLock('pessimistic_write')
          .where('dossier.id = :dossierId AND dossier.tenant_id = :tenantId', {
            dossierId,
            tenantId,
          })
          .getOne();
        if (!dossier)
          throw new NotFoundException(`Dossier ${dossierId} introuvable`);
        if (dossier.workflow_engine !== WorkflowEngine.ACTIONS_V2) {
          throw new ConflictException(
            'Ce dossier utilise encore le parcours historique',
          );
        }
        if (dossier.lifecycle_phase === DossierLifecyclePhase.CLOSED) {
          throw new ConflictException(
            'Le dossier est clôturé. Réouvrez-le avant de créer une action.',
          );
        }
        if (
          dossier.lifecycle_phase === DossierLifecyclePhase.OPENING ||
          !dossier.opening_validated_at
        ) {
          throw new ConflictException(
            'Validez l’ouverture du dossier avant de créer une action.',
          );
        }
        if (!dossier.legacy_workflow_locked) {
          dossier.legacy_workflow_locked = true;
          await manager.getRepository(Dossier).save(dossier);
        }
        const definition = await manager
          .getRepository(ActionDefinition)
          .findOne({
            where: {
              id: dto.definition_id,
              tenant_id: tenantId,
              is_active: true,
            },
          });
        if (!definition)
          throw new NotFoundException(
            'Définition d’action introuvable ou inactive',
          );
        if (dto.responsible_user_id) {
          const responsible = await manager.getRepository(User).findOne({
            where: { id: dto.responsible_user_id, tenant_id: tenantId },
          });
          if (!responsible)
            throw new BadRequestException(
              'Responsable introuvable dans ce cabinet',
            );
        }
        await this.validateLinkedIds(manager, dossierId, dto, actorUserId);
        // La création doit rester instantanée : les informations propres à
        // l’action et ses liens sont désormais renseignés progressivement.
        const dueAt = dto.due_at
          ? new Date(dto.due_at)
          : definition.default_due_days == null
            ? null
            : new Date(Date.now() + definition.default_due_days * 86_400_000);
        const remindAt = dto.remind_at ? new Date(dto.remind_at) : null;
        if (
          remindAt &&
          (!dueAt ||
            remindAt.getTime() >= dueAt.getTime() ||
            remindAt.getTime() <= Date.now())
        ) {
          throw new BadRequestException(
            'Le rappel doit être futur et antérieur à l’échéance',
          );
        }
        const repository = manager.getRepository(DossierAction);
        const created = await repository.save(
          repository.create({
            tenant_id: tenantId,
            dossier_id: dossierId,
            definition_id: definition.id,
            definition_code: definition.code,
            definition_label: definition.label,
            definition_version: definition.version,
            definition,
            title: dto.title?.trim() || definition.label,
            responsible_user_id: dto.responsible_user_id ?? actorUserId,
            status: autoStart
              ? DossierActionStatus.IN_PROGRESS
              : DossierActionStatus.TODO,
            priority: dto.priority ?? definition.default_priority,
            is_required: definition.is_required,
            planned_at: dto.planned_at ? new Date(dto.planned_at) : new Date(),
            due_at: dueAt,
            remind_at: remindAt,
            reminder_sent_at: null,
            started_at: autoStart ? new Date() : null,
            completed_at: null,
            cancelled_at: null,
            result_code: null,
            result_notes: null,
            duration_minutes: null,
            specific_data: dto.specific_data ?? {},
            source_recommendation_id: dto.source_recommendation_id ?? null,
            idempotency_key: idempotencyKey,
          }),
        );
        await this.saveLinks(manager, created, dto);
        await this.createLinkedDiligence(manager, created);
        await this.eventService.append(manager, {
          dossierId,
          eventType: autoStart
            ? 'DOSSIER_ACTION_STARTED'
            : 'DOSSIER_ACTION_CREATED',
          aggregateType: 'DossierAction',
          aggregateId: created.id,
          actorUserId,
          payload: {
            definitionCode: created.definition_code,
            definitionVersion: created.definition_version,
          },
          idempotencyKey: `ACTION_CREATE:${idempotencyKey}`,
        });
        return created;
      });
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const concurrent = await this.actionRepository.findOne({
        where: dto.source_recommendation_id
          ? [
              { tenant_id: tenantId, idempotency_key: idempotencyKey },
              {
                tenant_id: tenantId,
                source_recommendation_id: dto.source_recommendation_id,
              },
            ]
          : { tenant_id: tenantId, idempotency_key: idempotencyKey },
        relations: ['definition'],
      });
      if (!concurrent) throw error;
      action = concurrent;
    }
    if (!dto.source_recommendation_id) {
      await this.recommendationService.evaluate(
        dossierId,
        RecommendationTrigger.MANUAL,
        `ACTION_CREATED:${action.id}`,
      );
    }
    return action;
  }

  async updateDetails(
    actionId: string,
    dto: UpdateDossierActionDetailsDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<DossierAction> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const eventKey = `ACTION_DETAILS:${idempotencyKey}`;
      const priorEvent = await manager
        .getRepository(CaseWorkflowEvent)
        .findOne({
          where: { tenant_id: tenantId, idempotency_key: eventKey },
        });
      if (priorEvent) {
        const existing = await manager.getRepository(DossierAction).findOne({
          where: { id: actionId, tenant_id: tenantId },
          relations: ['definition'],
        });
        if (existing) return existing;
      }

      const repository = manager.getRepository(DossierAction);
      const action = await repository
        .createQueryBuilder('action')
        .leftJoinAndSelect('action.definition', 'definition')
        .setLock('pessimistic_write')
        .where('action.id = :actionId AND action.tenant_id = :tenantId', {
          actionId,
          tenantId,
        })
        .getOne();
      if (!action) throw new NotFoundException('Action introuvable');
      await this.assertConfidentialDossierAccess(
        manager,
        action.dossier_id,
        actorUserId,
      );
      if (action.lock_version !== dto.expected_version) {
        throw new ConflictException(
          'Cette action a été modifiée. Rechargez le dossier.',
        );
      }
      if (
        ![
          DossierActionStatus.TODO,
          DossierActionStatus.IN_PROGRESS,
          DossierActionStatus.ON_HOLD,
        ].includes(action.status)
      ) {
        throw new ConflictException(
          'Les informations d’une action terminée ou annulée ne peuvent plus être modifiées',
        );
      }

      await this.validateLinkedIds(
        manager,
        action.dossier_id,
        dto,
        actorUserId,
      );
      const nextSpecificData = {
        ...(action.specific_data ?? {}),
        ...(dto.specific_data ?? {}),
      };
      const schemaWithoutRequiredFields = action.definition
        .specific_fields_schema
        ? {
            ...action.definition.specific_fields_schema,
            required: [],
            required_on_start: [],
          }
        : null;
      this.validateSpecificData(schemaWithoutRequiredFields, nextSpecificData);

      action.specific_data = nextSpecificData;
      const saved = await repository.save(action);
      await this.replaceActionInputs(manager, saved, dto);
      await this.eventService.append(manager, {
        dossierId: saved.dossier_id,
        eventType: 'DOSSIER_ACTION_DETAILS_UPDATED',
        aggregateType: 'DossierAction',
        aggregateId: saved.id,
        actorUserId,
        payload: {
          fields: Object.keys(dto.specific_data ?? {}),
          documentCount: dto.documents?.length ?? null,
          audienceCount: dto.audiences?.length ?? null,
          dependencyCount: dto.previous_actions?.length ?? null,
        },
        idempotencyKey: eventKey,
      });
      return saved;
    });
  }

  private async transition(
    actionId: string,
    target: DossierActionStatus,
    dto: ActionTransitionDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<DossierAction> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.getRepository(CaseWorkflowEvent).findOne({
        where: {
          tenant_id: tenantId,
          idempotency_key: `ACTION_TRANSITION:${idempotencyKey}`,
        },
      });
      if (event) {
        const existing = await manager
          .getRepository(DossierAction)
          .findOne({ where: { id: actionId, tenant_id: tenantId } });
        if (existing) return existing;
      }
      const repository = manager.getRepository(DossierAction);
      const action = await repository
        .createQueryBuilder('action')
        .setLock('pessimistic_write')
        .where('action.id = :actionId AND action.tenant_id = :tenantId', {
          actionId,
          tenantId,
        })
        .getOne();
      if (!action) throw new NotFoundException('Action introuvable');
      await this.assertConfidentialDossierAccess(
        manager,
        action.dossier_id,
        actorUserId,
      );
      await manager
        .getRepository(Dossier)
        .update(
          { id: action.dossier_id, tenant_id: tenantId },
          { legacy_workflow_locked: true },
        );
      if (action.lock_version !== dto.expected_version)
        throw new ConflictException(
          'Cette action a été modifiée. Rechargez le dossier.',
        );
      const validSources: Record<DossierActionStatus, DossierActionStatus[]> = {
        [DossierActionStatus.TODO]: [],
        [DossierActionStatus.IN_PROGRESS]: [
          DossierActionStatus.TODO,
          DossierActionStatus.ON_HOLD,
        ],
        [DossierActionStatus.ON_HOLD]: [DossierActionStatus.IN_PROGRESS],
        [DossierActionStatus.COMPLETED]: [DossierActionStatus.IN_PROGRESS],
        [DossierActionStatus.CANCELLED]: [
          DossierActionStatus.TODO,
          DossierActionStatus.IN_PROGRESS,
          DossierActionStatus.ON_HOLD,
        ],
      };
      if (!validSources[target].includes(action.status)) {
        throw new ConflictException(
          `Transition ${action.status} → ${target} interdite`,
        );
      }
      const previousStatus = action.status;
      action.status = target;
      if (target === DossierActionStatus.IN_PROGRESS)
        action.started_at = action.started_at ?? new Date();
      if (target === DossierActionStatus.CANCELLED) {
        action.cancelled_at = new Date();
        action.result_notes = dto.reason ?? action.result_notes;
        await Promise.all([
          manager
            .getRepository(DossierActionDocumentLink)
            .update({ action_id: action.id }, { requires_review: true }),
          manager
            .getRepository(DossierActionAudienceLink)
            .update({ action_id: action.id }, { requires_review: true }),
        ]);
      }
      const saved = await repository.save(action);
      await this.syncLinkedDiligence(manager, saved);
      await this.eventService.append(manager, {
        dossierId: action.dossier_id,
        eventType: `DOSSIER_ACTION_${target}`,
        aggregateType: 'DossierAction',
        aggregateId: action.id,
        actorUserId,
        payload: {
          from: previousStatus,
          to: target,
          reason: dto.reason ?? null,
        },
        idempotencyKey: `ACTION_TRANSITION:${idempotencyKey}`,
      });
      return saved;
    });
  }

  start(
    id: string,
    dto: ActionTransitionDto,
    key: string,
    userId: number,
  ): Promise<DossierAction> {
    return this.transition(
      id,
      DossierActionStatus.IN_PROGRESS,
      dto,
      key,
      userId,
    );
  }

  hold(
    id: string,
    dto: ActionTransitionDto,
    key: string,
    userId: number,
  ): Promise<DossierAction> {
    return this.transition(id, DossierActionStatus.ON_HOLD, dto, key, userId);
  }

  cancel(
    id: string,
    dto: ActionTransitionDto,
    key: string,
    userId: number,
  ): Promise<DossierAction> {
    return this.transition(id, DossierActionStatus.CANCELLED, dto, key, userId);
  }

  async extendDeadline(
    actionId: string,
    dto: ExtendDossierActionDeadlineDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<DossierAction> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const eventKey = `ACTION_DEADLINE_EXTEND:${idempotencyKey}`;
      const priorEvent = await manager
        .getRepository(CaseWorkflowEvent)
        .findOne({
          where: { tenant_id: tenantId, idempotency_key: eventKey },
        });
      if (priorEvent) {
        const existing = await manager.getRepository(DossierAction).findOne({
          where: { id: actionId, tenant_id: tenantId },
        });
        if (existing) return existing;
      }

      const repository = manager.getRepository(DossierAction);
      const action = await repository
        .createQueryBuilder('action')
        .setLock('pessimistic_write')
        .where('action.id = :actionId AND action.tenant_id = :tenantId', {
          actionId,
          tenantId,
        })
        .getOne();
      if (!action) throw new NotFoundException('Action introuvable');
      await this.assertConfidentialDossierAccess(
        manager,
        action.dossier_id,
        actorUserId,
      );
      if (action.lock_version !== dto.expected_version) {
        throw new ConflictException(
          'Cette action a été modifiée. Rechargez le dossier.',
        );
      }
      if (
        ![
          DossierActionStatus.TODO,
          DossierActionStatus.IN_PROGRESS,
          DossierActionStatus.ON_HOLD,
        ].includes(action.status)
      ) {
        throw new ConflictException(
          'L’échéance d’une action terminée ou annulée ne peut pas être modifiée',
        );
      }

      const dossier = await manager.getRepository(Dossier).findOne({
        where: { id: action.dossier_id, tenant_id: tenantId },
      });
      if (!dossier)
        throw new NotFoundException(`Dossier ${action.dossier_id} introuvable`);
      if (dossier.lifecycle_phase === DossierLifecyclePhase.CLOSED) {
        throw new ConflictException(
          'Le dossier est clôturé. Réouvrez-le avant de modifier une échéance.',
        );
      }

      const proposedDueAt = new Date(dto.due_at);
      const validationIssue = validateDeadlineExtension(
        action.due_at,
        proposedDueAt,
      );
      if (validationIssue) throw new BadRequestException(validationIssue);
      const proposedRemindAt = dto.remind_at ? new Date(dto.remind_at) : null;
      if (
        proposedRemindAt &&
        (proposedRemindAt.getTime() <= Date.now() ||
          proposedRemindAt.getTime() >= proposedDueAt.getTime())
      ) {
        throw new BadRequestException(
          'Le rappel doit être futur et antérieur à la nouvelle échéance',
        );
      }

      const previousDueAt = action.due_at;
      action.due_at = proposedDueAt;
      action.remind_at = proposedRemindAt;
      action.reminder_sent_at = null;
      const saved = await repository.save(action);
      await this.syncLinkedDiligence(manager, saved);
      await manager
        .getRepository(Dossier)
        .update(
          { id: action.dossier_id, tenant_id: tenantId },
          { legacy_workflow_locked: true },
        );
      await this.eventService.append(manager, {
        dossierId: action.dossier_id,
        eventType: previousDueAt
          ? 'DOSSIER_ACTION_DEADLINE_EXTENDED'
          : 'DOSSIER_ACTION_DEADLINE_SET',
        aggregateType: 'DossierAction',
        aggregateId: action.id,
        actorUserId,
        payload: {
          previousDueAt: previousDueAt?.toISOString() ?? null,
          dueAt: saved.due_at?.toISOString() ?? null,
          remindAt: saved.remind_at?.toISOString() ?? null,
          reason: dto.reason.trim(),
        },
        idempotencyKey: eventKey,
      });
      return saved;
    });
  }

  async complete(
    actionId: string,
    dto: CompleteDossierActionDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<{
    action: DossierAction;
    recommendation: DossierRecommendation | null;
    billableItem: BillableItem | null;
  }> {
    const tenantId = getCurrentTenantId();
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DossierAction);
      const action = await repository
        .createQueryBuilder('action')
        .leftJoinAndSelect('action.definition', 'definition')
        .setLock('pessimistic_write')
        .where('action.id = :actionId AND action.tenant_id = :tenantId', {
          actionId,
          tenantId,
        })
        .getOne();
      if (!action) throw new NotFoundException('Action introuvable');
      await this.assertConfidentialDossierAccess(
        manager,
        action.dossier_id,
        actorUserId,
      );
      await manager
        .getRepository(Dossier)
        .update(
          { id: action.dossier_id, tenant_id: tenantId },
          { legacy_workflow_locked: true },
        );
      const existingEvent = await manager
        .getRepository(CaseWorkflowEvent)
        .findOne({
          where: {
            tenant_id: tenantId,
            idempotency_key: `ACTION_COMPLETE:${idempotencyKey}`,
          },
        });
      if (existingEvent && action.status === DossierActionStatus.COMPLETED) {
        const priorItem = await manager.getRepository(BillableItem).findOne({
          where: {
            tenant_id: tenantId,
            source_event_key: `ACTION:${action.id}:COMPLETED`,
          },
        });
        return { action, billableItem: priorItem };
      }
      if (action.lock_version !== dto.expected_version)
        throw new ConflictException(
          'Cette action a été modifiée. Rechargez le dossier.',
        );
      if (action.status !== DossierActionStatus.IN_PROGRESS)
        throw new ConflictException(
          'Seule une action en cours peut être terminée',
        );
      const allowedResults = action.definition.allowed_results ?? [];
      if (
        allowedResults.length &&
        !allowedResults.some((item) => item.code === dto.result_code)
      ) {
        throw new BadRequestException(
          'Résultat non autorisé pour cette version de la définition',
        );
      }
      await this.validateLinkedIds(
        manager,
        action.dossier_id,
        dto,
        actorUserId,
      );
      this.validateSpecificData(
        action.definition.specific_fields_schema,
        dto.specific_data ?? action.specific_data ?? undefined,
      );
      await this.validateCompletionRequirements(manager, action, dto);
      action.status = DossierActionStatus.COMPLETED;
      action.completed_at = new Date();
      action.result_code = dto.result_code;
      action.result_notes = dto.result_notes ?? null;
      action.duration_minutes = dto.duration_minutes ?? null;
      action.specific_data = dto.specific_data ?? action.specific_data;
      action.billing_decision = dto.billing_decision;
      action.billing_reason = dto.billing_reason ?? null;
      const saved = await repository.save(action);
      await this.syncLinkedDiligence(manager, saved);
      await this.saveLinks(manager, saved, dto);
      const billableItem = await this.billingService.createForCompletedAction(
        manager,
        saved,
        actorUserId,
      );
      await this.eventService.append(manager, {
        dossierId: saved.dossier_id,
        eventType: 'DOSSIER_ACTION_COMPLETED',
        aggregateType: 'DossierAction',
        aggregateId: saved.id,
        actorUserId,
        payload: {
          resultCode: saved.result_code,
          durationMinutes: saved.duration_minutes,
          billableItemId: billableItem?.id ?? null,
        },
        idempotencyKey: `ACTION_COMPLETE:${idempotencyKey}`,
      });
      return { action: saved, billableItem };
    });
    const recommendation = await this.recommendationService.evaluate(
      result.action.dossier_id,
      RecommendationTrigger.ACTION_COMPLETED,
      `ACTION_COMPLETED:${result.action.id}:v${result.action.lock_version}`,
    );
    return { ...result, recommendation };
  }

  async startRecommendation(
    recommendationId: string,
    dto: ActionTransitionDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<DossierAction> {
    const tenantId = getCurrentTenantId();
    const recommendation = await this.recommendationRepository.findOne({
      where: { id: recommendationId, tenant_id: tenantId },
    });
    if (!recommendation)
      throw new NotFoundException('Recommandation introuvable');
    if (recommendation.status === RecommendationStatus.ACCEPTED) {
      const existing = await this.actionRepository.findOne({
        where: {
          tenant_id: tenantId,
          source_recommendation_id: recommendation.id,
        },
      });
      if (existing) return existing;
    }
    if (recommendation.status !== RecommendationStatus.ACTIVE)
      throw new ConflictException('Cette recommandation n’est plus active');
    if (recommendation.lock_version !== dto.expected_version)
      throw new ConflictException('Cette recommandation a été modifiée');
    const action = await this.create(
      recommendation.dossier_id,
      {
        definition_id: recommendation.action_definition_id,
        source_recommendation_id: recommendation.id,
        due_at: recommendation.due_at?.toISOString(),
      },
      idempotencyKey,
      actorUserId,
      true,
    );
    recommendation.status = RecommendationStatus.ACCEPTED;
    await this.recommendationRepository.save(recommendation);
    return action;
  }

  async deferRecommendation(
    recommendationId: string,
    dto: DeferRecommendationDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<DossierRecommendation> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(DossierRecommendation);
      const recommendation = await repository
        .createQueryBuilder('recommendation')
        .setLock('pessimistic_write')
        .where(
          'recommendation.id = :id AND recommendation.tenant_id = :tenantId',
          { id: recommendationId, tenantId },
        )
        .getOne();
      if (!recommendation)
        throw new NotFoundException('Recommandation introuvable');
      await this.assertConfidentialDossierAccess(
        manager,
        recommendation.dossier_id,
        actorUserId,
      );
      if (recommendation.lock_version !== dto.expected_version)
        throw new ConflictException('Cette recommandation a été modifiée');
      if (recommendation.status !== RecommendationStatus.ACTIVE)
        throw new ConflictException('Cette recommandation n’est plus active');
      const remindAt = new Date(dto.remind_at);
      if (remindAt.getTime() <= Date.now())
        throw new BadRequestException(
          'Le rappel doit être planifié dans le futur',
        );
      recommendation.status = RecommendationStatus.DEFERRED;
      recommendation.remind_at = remindAt;
      recommendation.reason = dto.reason
        ? `${recommendation.reason} — Report: ${dto.reason}`
        : recommendation.reason;
      const saved = await repository.save(recommendation);
      await this.eventService.append(manager, {
        dossierId: saved.dossier_id,
        eventType: 'DOSSIER_RECOMMENDATION_DEFERRED',
        aggregateType: 'DossierRecommendation',
        aggregateId: saved.id,
        actorUserId,
        payload: { remindAt: saved.remind_at?.toISOString() },
        idempotencyKey: `RECOMMENDATION_DEFER:${idempotencyKey}`,
      });
      return saved;
    });
  }
}
