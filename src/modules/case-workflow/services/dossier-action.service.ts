import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from 'src/core/enums/user-role.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { isDuplicateKeyError } from 'src/core/shared/utils/db-error.util';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  Audience,
  AudienceStatus,
} from 'src/modules/audiences/entities/audience.entity';
import { postponeAudienceWithManager } from 'src/modules/audiences/audience-workflow';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DossierAccessGrant } from 'src/modules/dossiers/entities/dossier-access-grant.entity';
import { canBypassConfidentiality } from 'src/modules/dossiers/dossier-visibility';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Diligence,
  DiligencePriority,
  DiligenceStatus,
  DiligenceType,
} from 'src/modules/diligence/entities/diligence.entity';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
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
import { CaseWorkflowNotificationsService } from './case-workflow-notifications.service';
import { RecommendationService } from './recommendation.service';
import { WorkflowEventService } from './workflow-event.service';
import {
  validateDeadlineExtension,
  validateDynamicPayload,
  validateRequiredRelations,
} from '../case-workflow.logic';
import {
  AUDIENCE_BINDABLE_FIELDS,
  AudienceBinding,
  POSTPONE_OWNED_AUDIENCE_FIELDS,
  buildAudiencePatch,
  collectAudienceBindings,
} from '../audience-binding';

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
    private readonly workflowNotifications: CaseWorkflowNotificationsService,
  ) {}

  async list(
    dossierId: number,
    actorUserId: number,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
      familyId?: string;
      search?: string;
    } = {},
  ) {
    await this.assertConfidentialDossierAccess(
      this.dataSource.manager,
      dossierId,
      actorUserId,
    );
    const tenantId = getCurrentTenantId();
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 12));
    const query = this.actionRepository
      .createQueryBuilder('action')
      .leftJoinAndSelect('action.definition', 'definition')
      .leftJoinAndSelect('definition.family', 'family')
      .where('action.tenant_id = :tenantId', { tenantId })
      .andWhere('action.dossier_id = :dossierId', { dossierId });

    const statuses = (filters.status ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) =>
        Object.values(DossierActionStatus).includes(
          value as DossierActionStatus,
        ),
      );
    if (statuses.length)
      query.andWhere('action.status IN (:...statuses)', { statuses });
    if (filters.familyId?.trim()) {
      query.andWhere('family.id = :familyId', {
        familyId: filters.familyId.trim(),
      });
    }
    if (filters.search?.trim()) {
      query.andWhere(
        '(action.title LIKE :search OR action.definition_label LIKE :search OR action.result_notes LIKE :search)',
        { search: `%${filters.search.trim()}%` },
      );
    }

    const [actions, total] = await query
      .orderBy('action.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const actionIds = actions.map((action) => action.id);
    const [documentLinks, audienceLinks, relationLinks] = actionIds.length
      ? await Promise.all([
          this.dataSource.getRepository(DossierActionDocumentLink).find({
            where: { tenant_id: tenantId, action_id: In(actionIds) },
          }),
          this.dataSource.getRepository(DossierActionAudienceLink).find({
            where: { tenant_id: tenantId, action_id: In(actionIds) },
          }),
          this.dataSource.getRepository(DossierActionRelation).find({
            where: { tenant_id: tenantId, action_id: In(actionIds) },
          }),
        ])
      : [[], [], []];

    return {
      data: actions.map((action) => ({
        ...action,
        document_links: documentLinks.filter(
          (link) => link.action_id === action.id,
        ),
        audience_links: audienceLinks.filter(
          (link) => link.action_id === action.id,
        ),
        relation_links: relationLinks.filter(
          (link) => link.action_id === action.id,
        ),
      })),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getDeadlineHistory(actionId: string, actorUserId: number) {
    const tenantId = getCurrentTenantId();
    const action = await this.actionRepository.findOne({
      where: { id: actionId, tenant_id: tenantId },
    });
    if (!action) throw new NotFoundException('Action introuvable');

    await this.assertConfidentialDossierAccess(
      this.dataSource.manager,
      action.dossier_id,
      actorUserId,
    );

    const events = await this.dataSource.getRepository(CaseWorkflowEvent).find({
      where: {
        tenant_id: tenantId,
        dossier_id: action.dossier_id,
        aggregate_type: 'DossierAction',
        aggregate_id: action.id,
        event_type: In([
          'DOSSIER_ACTION_DEADLINE_EXTENDED',
          'DOSSIER_ACTION_DEADLINE_SET',
        ]),
      },
      order: { occurred_at: 'DESC' },
    });

    const actorIds = [
      ...new Set(
        events
          .map((event) => event.actor_user_id)
          .filter((id): id is number => id !== null),
      ),
    ];
    const actors = actorIds.length
      ? await this.dataSource.getRepository(User).find({
          where: { tenant_id: tenantId, id: In(actorIds) },
        })
      : [];
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

    return events.map((event) => {
      const actor = event.actor_user_id
        ? actorsById.get(event.actor_user_id)
        : undefined;
      return {
        id: event.id,
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        actor_user_id: event.actor_user_id,
        payload: event.payload,
        actor: actor
          ? {
              id: actor.id,
              first_name: actor.first_name,
              last_name: actor.last_name,
              full_name: `${actor.first_name} ${actor.last_name}`.trim(),
            }
          : null,
      };
    });
  }

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
  ): Promise<Dossier> {
    const tenantId = getCurrentTenantId();
    const dossier = await manager.getRepository(Dossier).findOne({
      where: { id: dossierId, tenant_id: tenantId },
      relations: [
        'lawyer',
        'lawyer.user',
        'collaborators',
        'collaborators.user',
      ],
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (!dossier.confidentiality_level) return dossier;
    if (canBypassConfidentiality()) return dossier;

    // Même règle que les listes et les statistiques : seule une autorisation
    // nominative ouvre un dossier confidentiel. L'affectation au dossier
    // (avocat responsable, collaborateurs) ne vaut pas droit d'accès.
    const grant = await manager.getRepository(DossierAccessGrant).findOne({
      where: {
        dossier_id: dossier.id,
        employee_id: actorUserId,
        revoked_at: IsNull(),
      },
    });
    if (!grant) {
      throw new ForbiddenException(
        "Ce dossier confidentiel nécessite une autorisation d'accès accordée par l'administration",
      );
    }
    return dossier;
  }

  private async ensureLegacyWorkflowLocked(
    manager: EntityManager,
    dossier: Dossier,
  ): Promise<void> {
    if (dossier.legacy_workflow_locked) return;
    dossier.legacy_workflow_locked = true;
    await manager.getRepository(Dossier).save(dossier);
  }

  private validateSpecificData(
    schema: Record<string, any> | null,
    data: Record<string, unknown> | undefined,
    requiredProperty: 'required' | 'required_on_start' = 'required',
  ): void {
    const issue = validateDynamicPayload(schema, data, requiredProperty)[0];
    if (issue) throw new BadRequestException(issue.message);
  }

  private normalizeBusinessCode(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private isHearingReportAction(action: DossierAction): boolean {
    const code = this.normalizeBusinessCode(action.definition_code);
    if (
      [
        'WRITE_HEARING_REPORT',
        'RAPPORT_AUDIENCE',
        'RAPPORT_D_AUDIENCE',
        'COMPTE_RENDU_AUDIENCE',
        'COMPTE_RENDU_D_AUDIENCE',
      ].includes(code)
    ) {
      return true;
    }
    const label = this.normalizeBusinessCode(action.definition_label);
    return (
      label.includes('AUDIENCE') &&
      (label.includes('RAPPORT') || label.includes('COMPTE_RENDU'))
    );
  }

  private isPostponedHearingResult(resultCode: string): boolean {
    const code = this.normalizeBusinessCode(resultCode);
    return (
      code.includes('POSTPON') ||
      code.includes('REPORTEE') ||
      code.includes('RENVOI') ||
      (code.includes('REPORT') && code.includes('AUDIENCE')) ||
      [
        'REPORT',
        'REPORT_AUDIENCE',
        'REPORT_D_AUDIENCE',
        'AUDIENCE_REPORT',
      ].includes(code)
    );
  }

  private readCompletionString(
    data: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  /** Audiences li\u00e9es \u00e0 l'action, en fusionnant les liens d\u00e9j\u00e0 pos\u00e9s et ceux du DTO. */
  private async resolveLinkedAudienceIds(
    manager: EntityManager,
    action: DossierAction,
    dto: CompleteDossierActionDto,
  ): Promise<number[]> {
    const tenantId = getCurrentTenantId();
    const existingLinks = await manager
      .getRepository(DossierActionAudienceLink)
      .find({ where: { tenant_id: tenantId, action_id: action.id } });
    return [
      ...new Set([
        ...existingLinks.map((link) => link.audience_id),
        ...(dto.audiences ?? []).map((link) => link.id),
      ]),
    ];
  }

  /**
   * Applique les liaisons d\u00e9clar\u00e9es sur une audience d\u00e9j\u00e0 charg\u00e9e.
   *
   * Seconde v\u00e9rification de la liste blanche au moment de l'\u00e9criture : la cible
   * vient d'une configuration utilisateur, on ne pose jamais une propri\u00e9t\u00e9
   * arbitraire sur l'entit\u00e9.
   */
  private applyAudienceBindings(
    audience: Audience,
    bindings: readonly AudienceBinding[],
    specificData: Record<string, unknown>,
  ): void {
    if (!bindings.length) return;
    const { patch, issues } = buildAudiencePatch(bindings, specificData);
    if (issues.length) throw new BadRequestException(issues[0]);
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.prototype.hasOwnProperty.call(AUDIENCE_BINDABLE_FIELDS, key))
        continue;
      (audience as unknown as Record<string, unknown>)[key] = value;
    }
  }

  /**
   * Synchronise l'audience li\u00e9e avec l'action qui vient d'\u00eatre cl\u00f4tur\u00e9e.
   *
   * Deux sources se cumulent :
   *  - le comportement historique du rapport d'audience, reconnu par son code ou
   *    son libell\u00e9 (`isHearingReportAction`) et conserv\u00e9 tel quel pour les
   *    d\u00e9finitions d\u00e9j\u00e0 livr\u00e9es ;
   *  - les liaisons \u00ab champ d'action \u2192 champ d'audience \u00bb configur\u00e9es dans le
   *    catalogue, qui recopient n'importe quel champ personnalis\u00e9 vers une
   *    colonne autoris\u00e9e de l'audience.
   */
  private async applyAudienceCompletionEffects(
    manager: EntityManager,
    action: DossierAction,
    dto: CompleteDossierActionDto,
    actorUserId: number,
  ): Promise<void> {
    const bindings = collectAudienceBindings(
      action.definition?.specific_fields_schema ?? null,
    );
    const legacy = this.isHearingReportAction(action);
    if (!bindings.length && !legacy) return;

    const tenantId = getCurrentTenantId();
    const audienceIds = await this.resolveLinkedAudienceIds(
      manager,
      action,
      dto,
    );

    if (legacy) {
      if (audienceIds.length !== 1) {
        throw new BadRequestException(
          audienceIds.length === 0
            ? `Une audience doit \u00eatre li\u00e9e au rapport d'audience.`
            : `Le rapport d'audience doit cibler une seule audience.`,
        );
      }
    } else {
      // Une liaison ne rend pas l'audience obligatoire : c'est le r\u00f4le du
      // r\u00e9glage \u00ab Audiences \u00bb des relations requises, d\u00e9j\u00e0 contr\u00f4l\u00e9 en amont.
      if (audienceIds.length === 0) return;
      if (audienceIds.length > 1) {
        throw new BadRequestException(
          `Cette action \u00e9crit dans une audience : une seule audience doit \u00eatre li\u00e9e.`,
        );
      }
    }

    const specificData = dto.specific_data ?? action.specific_data ?? {};

    // Une liaison explicite vers report_content prime sur le reniflage d'alias
    // historique : c'est ce qui \u00e9vite la double \u00e9criture quand une d\u00e9finition
    // livr\u00e9e est reconfigur\u00e9e depuis le catalogue.
    const reportContentBinding = bindings.find(
      (binding) => binding.target === 'report_content',
    );
    let reportContent: string | undefined;
    if (legacy) {
      reportContent = reportContentBinding
        ? this.readCompletionString(specificData, [
            reportContentBinding.sourceKey,
          ])
        : (this.readCompletionString(specificData, [
            'report_content',
            'reportContent',
            'hearing_report',
            'hearingReport',
          ]) ?? dto.result_notes?.trim());
      if (!reportContent) {
        throw new BadRequestException(`Le rapport d'audience est obligatoire.`);
      }
    }

    if (legacy && this.isPostponedHearingResult(dto.result_code)) {
      const reason = this.readCompletionString(specificData, [
        'postponement_reason',
        'postpone_reason',
        'report_reason',
        'reason',
      ]);
      const audienceDate = this.readCompletionString(specificData, [
        'new_audience_date',
        'postponed_date',
        'audience_date',
      ]);
      const audienceTime = this.readCompletionString(specificData, [
        'new_audience_time',
        'postponed_time',
        'audience_time',
      ]);
      if (!reason) {
        throw new BadRequestException(
          `Le motif du report d'audience est obligatoire.`,
        );
      }
      if (!audienceDate || !audienceTime) {
        throw new BadRequestException(
          `La nouvelle date et la nouvelle heure sont obligatoires pour reporter l'audience.`,
        );
      }
      const { original } = await postponeAudienceWithManager(
        manager,
        audienceIds[0],
        {
          audience_date: audienceDate,
          audience_time: audienceTime,
          reason,
          report_content: reportContent,
          report_author_id: String(actorUserId),
        },
      );

      // Le report est propri\u00e9taire du proc\u00e8s-verbal, du statut et des dates :
      // seules les liaisons qui ne touchent pas \u00e0 ces champs sont appliqu\u00e9es.
      const safeBindings = bindings.filter(
        (binding) => !POSTPONE_OWNED_AUDIENCE_FIELDS.has(binding.target),
      );
      if (safeBindings.length) {
        this.applyAudienceBindings(original, safeBindings, specificData);
        await manager.getRepository(Audience).save(original);
      }
      return;
    }

    const audienceRepository = manager.getRepository(Audience);
    const audience = await audienceRepository.findOne({
      where: { id: audienceIds[0], tenant_id: tenantId },
    });
    if (!audience) throw new NotFoundException('Audience introuvable');
    if (audience.status === AudienceStatus.CANCELLED) {
      throw new BadRequestException(
        `Le rapport ne peut pas \u00eatre rattach\u00e9 \u00e0 une audience annul\u00e9e.`,
      );
    }

    if (legacy && reportContent) {
      audience.report_content = reportContent;
      audience.report_date = new Date();
      audience.report_author_id = String(actorUserId);
    }

    this.applyAudienceBindings(audience, bindings, specificData);

    // Heuristique historique, volontairement limit\u00e9e aux actions de rapport
    // d'audience : un code de r\u00e9sultat contenant \u00ab TENUE \u00bb sur une action
    // quelconque ne doit pas cl\u00f4turer l'audience.
    const normalizedResult = this.normalizeBusinessCode(dto.result_code);
    if (
      legacy &&
      (normalizedResult.includes('HELD') || normalizedResult.includes('TENUE'))
    ) {
      audience.mark_as_held(undefined, 'held');
    }
    await audienceRepository.save(audience);
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
    // Règle unique (voir dossiers/dossier-visibility.ts) : administration ou
    // autorisation nominative. L'affectation au dossier ne suffit pas.
    const canAccessConfidential =
      canBypassConfidentiality() ||
      !!(await manager.getRepository(DossierAccessGrant).findOne({
        where: {
          dossier_id: dossier.id,
          employee_id: actorUserId,
          revoked_at: IsNull(),
        },
      }));
    if (dossier.confidentiality_level && !canAccessConfidential) {
      throw new ForbiddenException(
        "Ce dossier confidentiel nécessite une autorisation d'accès accordée par l'administration",
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
    const distinctLinks = <T extends { id: number | string; role?: string }>(
      links: T[],
    ): T[] =>
      Array.from(
        new Map(
          links.map((link) => [`${String(link.id)}:${link.role ?? ''}`, link]),
        ).values(),
      );
    const issue = validateRequiredRelations(
      action.definition.required_relations,
      {
        documents: distinctLinks([
          ...documentLinks.map((link) => ({
            id: link.document_id,
            role: link.role,
          })),
          ...(dto.documents ?? []),
        ]),
        audiences: distinctLinks([
          ...audienceLinks.map((link) => ({
            id: link.audience_id,
            role: link.role,
          })),
          ...(dto.audiences ?? []),
        ]),
        previous_actions: distinctLinks(
          relationLinks.map((link) => ({
            id: link.related_action_id,
            role: link.role,
          })),
        ),
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
      if (!isDuplicateKeyError(error)) throw error;
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
    meta?: { replayed?: boolean },
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
        if (existing) {
          // Rejeu idempotent : la transition a déjà eu lieu (et a déjà été
          // notifiée) — ne pas renotifier.
          if (meta) meta.replayed = true;
          return existing;
        }
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
      const dossier = await this.assertConfidentialDossierAccess(
        manager,
        action.dossier_id,
        actorUserId,
      );
      await this.ensureLegacyWorkflowLocked(manager, dossier);
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

  /**
   * Applique la transition puis prévient le responsable de l'action (jamais
   * l'auteur du geste), une fois la transaction commitée. Un rejeu idempotent
   * ne renotifie pas.
   */
  private async transitionAndNotify(
    id: string,
    target: DossierActionStatus,
    dto: ActionTransitionDto,
    key: string,
    userId: number,
  ): Promise<DossierAction> {
    const meta: { replayed?: boolean } = {};
    const action = await this.transition(id, target, dto, key, userId, meta);
    if (meta.replayed) return action;

    if (target === DossierActionStatus.IN_PROGRESS) {
      await this.workflowNotifications.actionStarted(action, userId);
    } else if (target === DossierActionStatus.ON_HOLD) {
      await this.workflowNotifications.actionHeld(
        action,
        userId,
        dto.reason ?? null,
      );
    } else if (target === DossierActionStatus.CANCELLED) {
      await this.workflowNotifications.actionCancelled(
        action,
        userId,
        dto.reason ?? null,
      );
    }
    return action;
  }

  start(
    id: string,
    dto: ActionTransitionDto,
    key: string,
    userId: number,
  ): Promise<DossierAction> {
    return this.transitionAndNotify(
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
    return this.transitionAndNotify(
      id,
      DossierActionStatus.ON_HOLD,
      dto,
      key,
      userId,
    );
  }

  cancel(
    id: string,
    dto: ActionTransitionDto,
    key: string,
    userId: number,
  ): Promise<DossierAction> {
    return this.transitionAndNotify(
      id,
      DossierActionStatus.CANCELLED,
      dto,
      key,
      userId,
    );
  }

  async extendDeadline(
    actionId: string,
    dto: ExtendDossierActionDeadlineDto,
    idempotencyKey: string,
    actorUserId: number,
  ): Promise<DossierAction> {
    const tenantId = getCurrentTenantId();
    // Suivi hors transaction : permet de notifier après le commit, une seule fois.
    let replayed = false;
    let deadlineBefore: Date | null = null;

    const saved = await this.dataSource.transaction(async (manager) => {
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
        if (existing) {
          // Rejeu idempotent : le report a déjà été appliqué et notifié.
          replayed = true;
          return existing;
        }
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
      const dossier = await this.assertConfidentialDossierAccess(
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
      deadlineBefore = previousDueAt;
      action.due_at = proposedDueAt;
      action.remind_at = proposedRemindAt;
      action.reminder_sent_at = null;
      const saved = await repository.save(action);
      await this.syncLinkedDiligence(manager, saved);
      await this.ensureLegacyWorkflowLocked(manager, dossier);
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

    if (!replayed) {
      await this.workflowNotifications.actionDeadlineExtended(
        saved,
        actorUserId,
        deadlineBefore,
      );
    }
    return saved;
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
      const dossier = await this.assertConfidentialDossierAccess(
        manager,
        action.dossier_id,
        actorUserId,
      );
      await this.ensureLegacyWorkflowLocked(manager, dossier);
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
      const normalizedResult = this.normalizeBusinessCode(dto.result_code);
      const allowedByAudienceBinding =
        this.isHearingReportAction(action) &&
        (this.isPostponedHearingResult(dto.result_code) ||
          normalizedResult.includes('HELD') ||
          normalizedResult.includes('TENUE'));
      if (
        allowedResults.length &&
        !allowedResults.some((item) => item.code === dto.result_code) &&
        !allowedByAudienceBinding
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
      await this.applyAudienceCompletionEffects(
        manager,
        action,
        dto,
        actorUserId,
      );
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
