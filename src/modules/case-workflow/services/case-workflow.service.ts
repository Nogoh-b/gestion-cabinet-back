import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { UserRole } from 'src/core/enums/user-role.enum';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  Audience,
  AudienceStatus,
} from 'src/modules/audiences/entities/audience.entity';
import {
  Dossier,
  DossierOutcome,
} from 'src/modules/dossiers/entities/dossier.entity';
import { StepStatus } from 'src/modules/dossiers/entities/step.entity';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { DataSource, In, Repository } from 'typeorm';
import {
  BillableItemStatus,
  ClosureReviewStatus,
  DossierActionStatus,
  DossierLifecyclePhase,
  MigrationRunStatus,
  RecommendationStatus,
  RecommendationTrigger,
  WorkflowEngine,
} from '../case-workflow.enums';
import {
  ApplyWorkflowMigrationDto,
  CloseDossierV2Dto,
  CreateLegacyWorkflowMappingDto,
  ReopenDossierDto,
  ReviseLegacyWorkflowMappingDto,
} from '../dto/case-workflow.dto';
import { ActionDefinition } from '../entities/action-catalog.entity';
import {
  BillableItem,
  DossierBillingProfile,
} from '../entities/billing.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../entities/dossier-action.entity';
import { DossierRecommendation } from '../entities/recommendation.entity';
import {
  CaseWorkflowEvent,
  CaseWorkflowFeature,
  CaseWorkflowMigrationRun,
  CaseWorkflowOutbox,
  DossierClosureReview,
  LegacyWorkflowMapping,
} from '../entities/workflow-audit.entity';
import { ActionCatalogService } from './action-catalog.service';
import { CaseBillingService } from './case-billing.service';
import { RecommendationService } from './recommendation.service';
import { WorkflowEventService } from './workflow-event.service';
import { resolveLegacyMapping } from '../case-workflow.logic';

const DEFAULT_LEGACY_MAPPINGS: Array<{
  pattern: string;
  definitionCode: string;
  priority: number;
}> = [
  {
    pattern: 'analyse|etude',
    definitionCode: 'ANALYSE_DOSSIER',
    priority: 100,
  },
  {
    pattern: 'audience|plaidoirie',
    definitionCode: 'PREPARE_HEARING',
    priority: 95,
  },
  {
    pattern: 'document|redact|conclusion|requete',
    definitionCode: 'REVIEW_DRAFT',
    priority: 90,
  },
  {
    pattern: 'piece|preuve',
    definitionCode: 'REQUEST_MISSING_DOCUMENT',
    priority: 85,
  },
  {
    pattern: 'amiable|transaction|negocia',
    definitionCode: 'FOLLOW_UP_SETTLEMENT_PROPOSAL',
    priority: 80,
  },
  {
    pattern: 'execution|recouvrement',
    definitionCode: 'START_ENFORCEMENT',
    priority: 75,
  },
  { pattern: 'cloture', definitionCode: 'PREPARE_CLOSURE', priority: 70 },
];

export type ClosureFinding = Record<string, unknown> & {
  code: string;
  label: string;
  count?: number;
};

interface LegacyProposedAction {
  legacyLabel: string;
  definitionCode: string | null;
  requiresMapping: boolean;
}

@Injectable()
export class CaseWorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(DossierAction)
    private readonly actionRepository: Repository<DossierAction>,
    @InjectRepository(DossierRecommendation)
    private readonly recommendationRepository: Repository<DossierRecommendation>,
    @InjectRepository(BillableItem)
    private readonly itemRepository: Repository<BillableItem>,
    @InjectRepository(Audience)
    private readonly audienceRepository: Repository<Audience>,
    @InjectRepository(DocumentCustomer)
    private readonly documentRepository: Repository<DocumentCustomer>,
    @InjectRepository(Facture)
    private readonly factureRepository: Repository<Facture>,
    @InjectRepository(CaseWorkflowEvent)
    private readonly eventRepository: Repository<CaseWorkflowEvent>,
    @InjectRepository(CaseWorkflowFeature)
    private readonly featureRepository: Repository<CaseWorkflowFeature>,
    @InjectRepository(CaseWorkflowMigrationRun)
    private readonly migrationRepository: Repository<CaseWorkflowMigrationRun>,
    @InjectRepository(DossierClosureReview)
    private readonly closureRepository: Repository<DossierClosureReview>,
    @InjectRepository(LegacyWorkflowMapping)
    private readonly legacyMappingRepository: Repository<LegacyWorkflowMapping>,
    @InjectRepository(ActionDefinition)
    private readonly definitionRepository: Repository<ActionDefinition>,
    @InjectRepository(CaseWorkflowOutbox)
    private readonly outboxRepository: Repository<CaseWorkflowOutbox>,
    private readonly catalogService: ActionCatalogService,
    private readonly recommendationService: RecommendationService,
    private readonly billingService: CaseBillingService,
    private readonly eventService: WorkflowEventService,
  ) {}

  private assertConfidentialAccess(dossier: Dossier, user: User): void {
    if (!dossier.confidentiality_level || user.role === UserRole.ADMIN) return;
    const actorUserId = this.actorId(user);
    const assigned =
      dossier.lawyer_id === actorUserId ||
      dossier.lawyer?.id === actorUserId ||
      dossier.collaborators?.some(
        (collaborator) => collaborator.id === actorUserId,
      );
    if (!assigned) {
      throw new ForbiddenException(
        'Ce dossier confidentiel est réservé à ses membres affectés',
      );
    }
  }

  private actorId(user: User): number {
    return Number(user.id);
  }

  private readProposedActions(
    preview: Record<string, unknown>,
  ): LegacyProposedAction[] {
    const value = preview.proposedActions;
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        'L’aperçu de migration ne contient aucune action exploitable',
      );
    }
    return value.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Aperçu de migration invalide');
      }
      const candidate = item as Record<string, unknown>;
      return {
        legacyLabel:
          typeof candidate.legacyLabel === 'string'
            ? candidate.legacyLabel
            : '',
        definitionCode:
          typeof candidate.definitionCode === 'string'
            ? candidate.definitionCode
            : null,
        requiresMapping: candidate.requiresMapping === true,
      };
    });
  }

  async getFeature(): Promise<CaseWorkflowFeature> {
    const tenantId = getCurrentTenantId();
    const existing = await this.featureRepository.findOne({
      where: { tenant_id: tenantId },
    });
    if (existing) return existing;
    return this.featureRepository.save(
      this.featureRepository.create({
        tenant_id: tenantId,
        enabled: false,
        default_for_new_dossiers: false,
      }),
    );
  }

  async updateFeature(
    enabled: boolean,
    defaultForNewDossiers: boolean,
  ): Promise<CaseWorkflowFeature> {
    const feature = await this.getFeature();
    feature.enabled = enabled;
    feature.default_for_new_dossiers = enabled && defaultForNewDossiers;
    return this.featureRepository.save(feature);
  }

  async getMonitoring(): Promise<Record<string, unknown>> {
    const tenantId = getCurrentTenantId();
    const now = new Date();
    const [
      opening,
      treatment,
      closed,
      overdueActions,
      needsReview,
      toInvoice,
      migrationsPreviewed,
      migrationsApplied,
      pendingOutbox,
      failedOutbox,
    ] = await Promise.all([
      this.dossierRepository.count({
        where: {
          tenant_id: tenantId,
          workflow_engine: WorkflowEngine.ACTIONS_V2,
          lifecycle_phase: DossierLifecyclePhase.OPENING,
        },
      }),
      this.dossierRepository.count({
        where: {
          tenant_id: tenantId,
          workflow_engine: WorkflowEngine.ACTIONS_V2,
          lifecycle_phase: DossierLifecyclePhase.TREATMENT,
        },
      }),
      this.dossierRepository.count({
        where: {
          tenant_id: tenantId,
          workflow_engine: WorkflowEngine.ACTIONS_V2,
          lifecycle_phase: DossierLifecyclePhase.CLOSED,
        },
      }),
      this.actionRepository
        .createQueryBuilder('action')
        .where('action.tenant_id = :tenantId', { tenantId })
        .andWhere('action.status IN (:...statuses)', {
          statuses: [
            DossierActionStatus.TODO,
            DossierActionStatus.IN_PROGRESS,
            DossierActionStatus.ON_HOLD,
          ],
        })
        .andWhere('action.due_at < :now', { now })
        .getCount(),
      this.itemRepository.count({
        where: { tenant_id: tenantId, status: BillableItemStatus.NEEDS_REVIEW },
      }),
      this.itemRepository.count({
        where: { tenant_id: tenantId, status: BillableItemStatus.TO_INVOICE },
      }),
      this.migrationRepository.count({
        where: { tenant_id: tenantId, status: MigrationRunStatus.PREVIEWED },
      }),
      this.migrationRepository.count({
        where: { tenant_id: tenantId, status: MigrationRunStatus.APPLIED },
      }),
      this.outboxRepository
        .createQueryBuilder('outbox')
        .where('outbox.tenant_id = :tenantId', { tenantId })
        .andWhere('outbox.processed_at IS NULL')
        .getCount(),
      this.outboxRepository
        .createQueryBuilder('outbox')
        .where('outbox.tenant_id = :tenantId', { tenantId })
        .andWhere('outbox.processed_at IS NULL')
        .andWhere('outbox.attempts >= 5')
        .getCount(),
    ]);
    return {
      dossiers: { opening, treatment, closed },
      actions: { overdue: overdueActions },
      billing: { needsReview, toInvoice },
      migrations: {
        previewed: migrationsPreviewed,
        appliedNotConfirmed: migrationsApplied,
      },
      outbox: { pending: pendingOutbox, failed: failedOutbox },
      generatedAt: now.toISOString(),
    };
  }

  async isV2(dossierId: number): Promise<boolean> {
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId },
      select: ['id', 'workflow_engine'],
    });
    return dossier?.workflow_engine === WorkflowEngine.ACTIONS_V2;
  }

  async validateOpening(
    dossierId: number,
    idempotencyKey: string,
    user: User,
  ): Promise<any> {
    const tenantId = getCurrentTenantId();
    const actorUserId = this.actorId(user);
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Dossier);
      const dossier = await repository
        .createQueryBuilder('dossier')
        .setLock('pessimistic_write')
        .where('dossier.id = :dossierId AND dossier.tenant_id = :tenantId', {
          dossierId,
          tenantId,
        })
        .getOne();
      if (!dossier)
        throw new NotFoundException(`Dossier ${dossierId} introuvable`);
      const missing = [
        !dossier.client_id && 'client',
        !dossier.lawyer_id && 'avocat référent',
        !dossier.procedure_type_id && 'type de dossier',
        !dossier.object?.trim() && 'objet',
      ].filter(Boolean);
      if (missing.length)
        throw new BadRequestException(
          `Ouverture incomplète : ${missing.join(', ')}`,
        );
      if (!dossier.opening_validated_at) {
        dossier.workflow_engine = WorkflowEngine.ACTIONS_V2;
        dossier.lifecycle_phase = DossierLifecyclePhase.TREATMENT;
        dossier.opening_validated_at = new Date();
        dossier.opening_validated_by = actorUserId;
        await repository.save(dossier);
      }
      const openingItem = await this.billingService.createOpeningItem(
        manager,
        dossier,
        actorUserId,
      );
      await this.eventService.append(manager, {
        dossierId,
        eventType: 'DOSSIER_OPENING_VALIDATED',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        actorUserId,
        payload: {
          lifecyclePhase: dossier.lifecycle_phase,
          workflowEngine: dossier.workflow_engine,
        },
        idempotencyKey: `OPENING:${idempotencyKey}`,
      });
      return { dossier, openingItem };
    });

    await this.billingService.getProfile(dossierId);
    let openingInvoice: Facture | null = null;
    if (result.openingItem?.status === BillableItemStatus.TO_INVOICE) {
      openingInvoice = await this.billingService.invoiceFromItems(
        { billable_item_ids: [result.openingItem.id] },
        `OPENING:${dossierId}`,
        actorUserId,
      );
    }
    const recommendation = await this.recommendationService.evaluate(
      dossierId,
      RecommendationTrigger.OPENING_VALIDATED,
      `OPENING_VALIDATED:${dossierId}`,
    );
    return {
      dossier: result.dossier,
      recommendation,
      openingBillableItem: result.openingItem,
      openingInvoice,
    };
  }

  async getWorkspace(
    dossierId: number,
    user: User,
  ): Promise<Record<string, unknown>> {
    const tenantId = getCurrentTenantId();
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId, tenant_id: tenantId },
      relations: [
        'client',
        'lawyer',
        'lawyer.user',
        'collaborators',
        'collaborators.user',
        'jurisdiction',
        'procedure_type',
        'procedure_subtype',
      ],
    });
    if (!dossier)
      throw new NotFoundException(`Dossier ${dossierId} introuvable`);
    this.assertConfidentialAccess(dossier, user);
    const isV2 = dossier.workflow_engine === WorkflowEngine.ACTIONS_V2;
    let recommendation =
      isV2 && dossier.lifecycle_phase === DossierLifecyclePhase.TREATMENT
        ? await this.recommendationService.getCurrent(dossierId)
        : null;
    if (isV2 && dossier.lifecycle_phase === DossierLifecyclePhase.TREATMENT) {
      recommendation =
        (await this.recommendationService.evaluate(
          dossierId,
          RecommendationTrigger.MANUAL,
          `WORKSPACE_EVALUATION:${dossierId}:${new Date().toISOString().slice(0, 13)}`,
        )) ?? recommendation;
    }
    const [
      actions,
      audiences,
      documents,
      events,
      billableItems,
      invoices,
      reviewDocumentLinks,
      reviewAudienceLinks,
      billingProfile,
    ] = await Promise.all([
      this.actionRepository.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
        relations: ['definition', 'definition.family'],
        order: { created_at: 'DESC' },
        take: 30,
      }),
      this.audienceRepository.find({
        where: { tenant_id: tenantId, dossier_id: String(dossierId) },
        order: { audience_date: 'ASC' },
        take: 20,
      }),
      this.documentRepository.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
        order: { created_at: 'DESC' },
        take: 20,
      }),
      this.eventRepository.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
        order: { occurred_at: 'DESC' },
        take: 20,
      }),
      this.itemRepository.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
      }),
      this.factureRepository.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
        relations: ['paiements'],
        order: { dateFacture: 'DESC' },
        take: 20,
      }),
      this.dataSource.getRepository(DossierActionDocumentLink).count({
        where: {
          tenant_id: tenantId,
          requires_review: true,
          action: { dossier_id: dossierId },
        },
      }),
      this.dataSource.getRepository(DossierActionAudienceLink).count({
        where: {
          tenant_id: tenantId,
          requires_review: true,
          action: { dossier_id: dossierId },
        },
      }),
      this.dataSource
        .getRepository(DossierBillingProfile)
        .findOne({ where: { tenant_id: tenantId, dossier_id: dossierId } }),
    ]);

    const actionIds = actions.map((action) => action.id);
    const [actionDocumentLinks, actionAudienceLinks, actionRelations] =
      actionIds.length
        ? await Promise.all([
            this.dataSource.getRepository(DossierActionDocumentLink).find({
              where: {
                tenant_id: tenantId,
                action_id: In(actionIds),
              },
            }),
            this.dataSource.getRepository(DossierActionAudienceLink).find({
              where: {
                tenant_id: tenantId,
                action_id: In(actionIds),
              },
            }),
            this.dataSource.getRepository(DossierActionRelation).find({
              where: {
                tenant_id: tenantId,
                action_id: In(actionIds),
              },
            }),
          ])
        : [[], [], []];

    const workspaceActions = actions.map((action) => ({
      ...action,
      document_links: actionDocumentLinks.filter(
        (link) => link.action_id === action.id,
      ),
      audience_links: actionAudienceLinks.filter(
        (link) => link.action_id === action.id,
      ),
      relation_links: actionRelations.filter(
        (link) => link.action_id === action.id,
      ),
    }));

    const now = Date.now();
    const alerts: Array<Record<string, unknown>> = [];
    const overdue = actions.filter(
      (action) =>
        action.due_at &&
        action.due_at.getTime() < now &&
        ![
          DossierActionStatus.COMPLETED,
          DossierActionStatus.CANCELLED,
        ].includes(action.status),
    );
    if (overdue.length)
      alerts.push({
        type: 'OVERDUE_ACTIONS',
        severity: 'critical',
        count: overdue.length,
        label: `${overdue.length} action(s) en retard`,
      });
    const upcomingAudience = audiences.find(
      (audience) =>
        audience.status === AudienceStatus.SCHEDULED &&
        new Date(audience.audience_date).getTime() - now <= 7 * 86_400_000,
    );
    if (upcomingAudience)
      alerts.push({
        type: 'UPCOMING_HEARING',
        severity: 'high',
        audienceId: upcomingAudience.id,
        label: 'Audience prévue dans moins de 7 jours',
      });
    const postponed = audiences.filter(
      (audience) => audience.status === AudienceStatus.POSTPONED,
    ).length;
    if (postponed)
      alerts.push({
        type: 'POSTPONED_HEARING',
        severity: 'high',
        count: postponed,
        label: `${postponed} audience(s) reportée(s)`,
      });
    const reviewItems = billableItems.filter(
      (item) => item.status === BillableItemStatus.NEEDS_REVIEW,
    ).length;
    if (reviewItems)
      alerts.push({
        type: 'BILLING_REVIEW',
        severity: 'medium',
        count: reviewItems,
        label: `${reviewItems} élément(s) tarifaire(s) à revoir`,
      });
    const reviewLinks = reviewDocumentLinks + reviewAudienceLinks;
    if (reviewLinks)
      alerts.push({
        type: 'CANCELLED_ACTION_LINKS',
        severity: 'medium',
        count: reviewLinks,
        label: 'Éléments liés à une action annulée à vérifier',
      });

    const unifiedActivity = [
      ...events.map((event) => ({
        id: event.id,
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        payload: event.payload,
      })),
      ...documents.map((document) => ({
        id: `DOCUMENT:${document.id}`,
        event_type: 'DOCUMENT_ACTIVITY',
        occurred_at: document.updated_at ?? document.created_at,
        payload: {
          documentId: document.id,
          label: document.name,
          status: document.status,
        },
      })),
      ...audiences.map((audience) => ({
        id: `AUDIENCE:${audience.id}`,
        event_type:
          audience.status === AudienceStatus.POSTPONED
            ? 'AUDIENCE_POSTPONED'
            : 'AUDIENCE_ACTIVITY',
        occurred_at: audience.updated_at ?? audience.created_at,
        payload: {
          audienceId: audience.id,
          date: audience.audience_date,
          status: audience.status,
        },
      })),
      ...invoices.map((invoice) => ({
        id: `INVOICE:${invoice.id}`,
        event_type: 'INVOICE_ACTIVITY',
        occurred_at: invoice.updated_at ?? invoice.created_at,
        payload: {
          invoiceId: invoice.id,
          number: invoice.numero,
          status: invoice.status,
          amount: invoice.montantTTC,
        },
      })),
    ]
      .sort(
        (left, right) =>
          new Date(right.occurred_at).getTime() -
          new Date(left.occurred_at).getTime(),
      )
      .slice(0, 30);

    return {
      mode: isV2 ? 'ACTIONS_V2' : 'LEGACY',
      dossier: {
        ...dossier,
        context: {
          client: dossier.client,
          lawyer: dossier.lawyer?.user
            ? { ...dossier.lawyer.user, employee_id: dossier.lawyer.id }
            : dossier.lawyer,
          collaborators: (dossier.collaborators ?? []).map((employee) =>
            employee.user
              ? { ...employee.user, employee_id: employee.id }
              : employee,
          ),
          jurisdiction: dossier.jurisdiction,
          procedureType: dossier.procedure_type,
          procedureSubtype: dossier.procedure_subtype,
          opposingParty: {
            name: dossier.opposing_party_name,
            lawyer: dossier.opposing_party_lawyer,
            contact: dossier.opposing_party_contact,
          },
          thirdParties: dossier.third_parties,
          billingProfile,
        },
      },
      recommendation,
      alerts,
      actions: workspaceActions,
      documents,
      audiences,
      activity: unifiedActivity,
      billableItems: billableItems
        .sort(
          (left, right) =>
            right.occurred_at.getTime() - left.occurred_at.getTime(),
        )
        .slice(0, 30),
      financialSummary: {
        toInvoice: billableItems
          .filter((item) => item.status === BillableItemStatus.TO_INVOICE)
          .reduce((sum, item) => sum + Number(item.gross_amount), 0),
        needsReview: billableItems
          .filter((item) => item.status === BillableItemStatus.NEEDS_REVIEW)
          .reduce((sum, item) => sum + Number(item.gross_amount), 0),
        invoiced: billableItems
          .filter((item) => item.status === BillableItemStatus.INVOICED)
          .reduce((sum, item) => sum + Number(item.gross_amount), 0),
        unpaid: invoices
          .filter(
            (invoice) =>
              ![StatutFacture.PAYEE, StatutFacture.ANNULEE].includes(
                invoice.status,
              ),
          )
          .reduce((sum, invoice) => sum + Number(invoice.resteAPayer), 0),
        currency: billableItems[0]?.currency ?? invoices[0]?.currency ?? 'XAF',
      },
      quickLinks: {
        documents: `/documents?dossierId=${dossierId}`,
        audiences: `/audiences?dossierId=${dossierId}`,
        invoices: `/facturation/factures?dossierId=${dossierId}`,
        diligences: `/dossiers/diligences?dossierId=${dossierId}`,
      },
    };
  }

  async closureCheck(
    dossierId: number,
    user?: User,
  ): Promise<{
    canClose: boolean;
    blockers: ClosureFinding[];
    warnings: ClosureFinding[];
  }> {
    const tenantId = getCurrentTenantId();
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId, tenant_id: tenantId },
    });
    if (!dossier)
      throw new NotFoundException(`Dossier ${dossierId} introuvable`);
    const [
      requiredActions,
      audiencesForClosure,
      billables,
      documents,
      unpaidInvoices,
      migration,
    ] = await Promise.all([
      this.actionRepository.count({
        where: {
          tenant_id: tenantId,
          dossier_id: dossierId,
          is_required: true,
          status: In([
            DossierActionStatus.TODO,
            DossierActionStatus.IN_PROGRESS,
            DossierActionStatus.ON_HOLD,
          ]),
        },
      }),
      this.audienceRepository.find({
        where: {
          tenant_id: tenantId,
          dossier_id: String(dossierId),
          status: In([AudienceStatus.SCHEDULED, AudienceStatus.POSTPONED]),
        },
        relations: ['children_audiences'],
      }),
      this.itemRepository.count({
        where: {
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: In([
            BillableItemStatus.NEEDS_REVIEW,
            BillableItemStatus.TO_INVOICE,
          ]),
        },
      }),
      this.documentRepository.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
      }),
      this.factureRepository.count({
        where: {
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: In([
            StatutFacture.ENVOYEE,
            StatutFacture.PARTIELLEMENT_PAYEE,
            StatutFacture.IMPAYEE,
          ]),
        },
      }),
      this.migrationRepository.findOne({
        where: { tenant_id: tenantId, dossier_id: dossierId },
        order: { created_at: 'DESC' },
      }),
    ]);
    const blockers: ClosureFinding[] = [];
    const warnings: ClosureFinding[] = [];
    const activeAudiences = audiencesForClosure.filter(
      (audience) =>
        audience.status === AudienceStatus.SCHEDULED ||
        (audience.status === AudienceStatus.POSTPONED &&
          !audience.children_audiences?.length),
    ).length;
    const pendingDocuments = documents.filter(
      (document) => document.status === DocumentCustomerStatus.PENDING,
    ).length;
    const hasFinalDocument = documents.some((document) => {
      const metadata = document.metadata as unknown as Record<
        string,
        unknown
      > | null;
      return (
        metadata?.is_final === true ||
        /jugement|décision|decision|protocole|accord signé|accord signe/i.test(
          document.name ?? '',
        )
      );
    });
    if (dossier.workflow_engine !== WorkflowEngine.ACTIONS_V2)
      blockers.push({
        code: 'WORKFLOW_NOT_MIGRATED',
        label: 'Le dossier n’utilise pas encore le parcours V2',
      });
    if (requiredActions)
      blockers.push({
        code: 'REQUIRED_ACTIONS_OPEN',
        count: requiredActions,
        label: 'Des actions obligatoires sont encore ouvertes',
      });
    if (activeAudiences)
      blockers.push({
        code: 'ACTIVE_AUDIENCES',
        count: activeAudiences,
        label: 'Des audiences actives ne sont pas traitées',
      });
    if (
      migration &&
      [MigrationRunStatus.PREVIEWED, MigrationRunStatus.APPLIED].includes(
        migration.status,
      )
    )
      blockers.push({
        code: 'MIGRATION_INCOMPLETE',
        label: 'La migration du dossier est incomplète',
      });
    if (billables)
      warnings.push({
        code: 'BILLABLE_ITEMS',
        count: billables,
        label: 'Des éléments restent à facturer ou à revoir',
      });
    if (unpaidInvoices)
      warnings.push({
        code: 'UNPAID_INVOICES',
        count: unpaidInvoices,
        label: 'Des factures restent impayées',
      });
    if (pendingDocuments)
      warnings.push({
        code: 'PENDING_DOCUMENTS',
        count: pendingDocuments,
        label: 'Des pièces sont encore attendues',
      });
    if (!hasFinalDocument)
      warnings.push({
        code: 'FINAL_DOCUMENT_MISSING',
        label: 'Aucun document final n’est identifié dans le dossier',
      });
    const result = { canClose: blockers.length === 0, blockers, warnings };
    if (user) {
      await this.closureRepository.save(
        this.closureRepository.create({
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: ClosureReviewStatus.CHECKED,
          blockers,
          warnings,
          resolutions: null,
          justification: null,
          actor_user_id: this.actorId(user),
          checked_at: new Date(),
        }),
      );
    }
    return result;
  }

  async close(
    dossierId: number,
    dto: CloseDossierV2Dto,
    user: User,
    idempotencyKey: string,
  ): Promise<any> {
    const tenantId = getCurrentTenantId();
    const priorEvent = await this.eventRepository.findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        idempotency_key: `DOSSIER_CLOSE:${idempotencyKey}`,
      },
    });
    if (priorEvent) {
      return {
        dossier: await this.dossierRepository.findOne({
          where: { id: dossierId, tenant_id: tenantId },
        }),
      };
    }
    if (dto.outcome === DossierOutcome.UNKNOWN) {
      throw new BadRequestException(
        'L’issue du dossier est obligatoire pour la clôture',
      );
    }
    const check = await this.closureCheck(dossierId);
    if (check.blockers.length)
      throw new ConflictException({
        message: 'Le dossier ne peut pas être clôturé',
        ...check,
      });
    if (check.warnings.length && !dto.justification?.trim()) {
      throw new BadRequestException({
        message:
          'Une justification est requise pour accepter les avertissements',
        ...check,
      });
    }
    const actorUserId = this.actorId(user);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Dossier);
      const dossier = await repository
        .createQueryBuilder('dossier')
        .setLock('pessimistic_write')
        .where('dossier.id = :dossierId AND dossier.tenant_id = :tenantId', {
          dossierId,
          tenantId,
        })
        .getOne();
      if (!dossier) throw new NotFoundException('Dossier introuvable');
      if (dossier.lifecycle_phase === DossierLifecyclePhase.CLOSED)
        throw new ConflictException('Le dossier est déjà clôturé');
      const [requiredActionsNow, audiencesNow, migrationNow] =
        await Promise.all([
          manager.getRepository(DossierAction).count({
            where: {
              tenant_id: tenantId,
              dossier_id: dossierId,
              is_required: true,
              status: In([
                DossierActionStatus.TODO,
                DossierActionStatus.IN_PROGRESS,
                DossierActionStatus.ON_HOLD,
              ]),
            },
          }),
          manager.getRepository(Audience).find({
            where: {
              tenant_id: tenantId,
              dossier_id: String(dossierId),
              status: In([AudienceStatus.SCHEDULED, AudienceStatus.POSTPONED]),
            },
            relations: ['children_audiences'],
          }),
          manager.getRepository(CaseWorkflowMigrationRun).findOne({
            where: { tenant_id: tenantId, dossier_id: dossierId },
            order: { created_at: 'DESC' },
          }),
        ]);
      const activeAudiencesNow = audiencesNow.filter(
        (audience) =>
          audience.status === AudienceStatus.SCHEDULED ||
          (audience.status === AudienceStatus.POSTPONED &&
            !audience.children_audiences?.length),
      ).length;
      if (
        requiredActionsNow ||
        activeAudiencesNow ||
        (migrationNow &&
          [MigrationRunStatus.PREVIEWED, MigrationRunStatus.APPLIED].includes(
            migrationNow.status,
          ))
      ) {
        throw new ConflictException(
          'Le contrôle de clôture a changé. Recalculez-le avant de réessayer.',
        );
      }
      dossier.lifecycle_phase = DossierLifecyclePhase.CLOSED;
      dossier.status = DossierStatus.CLOSED;
      dossier.closing_date = new Date();
      dossier.outcome = dto.outcome;
      dossier.outcome_date = new Date();
      dossier.outcome_notes = dto.outcome_notes ?? '';
      dossier.final_decision =
        dto.final_decision_text ?? dossier.final_decision;
      dossier.client_satisfaction =
        dto.client_satisfaction ?? dossier.client_satisfaction;
      await repository.save(dossier);
      await manager.getRepository(DossierRecommendation).update(
        {
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: In([
            RecommendationStatus.ACTIVE,
            RecommendationStatus.DEFERRED,
          ]),
        },
        { status: RecommendationStatus.DISMISSED },
      );
      const review = await manager.getRepository(DossierClosureReview).save(
        manager.getRepository(DossierClosureReview).create({
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: ClosureReviewStatus.CLOSED,
          blockers: check.blockers,
          warnings: check.warnings,
          resolutions: dto.resolutions ?? null,
          justification: dto.justification ?? null,
          actor_user_id: actorUserId,
          checked_at: new Date(),
        }),
      );
      await this.eventService.append(manager, {
        dossierId,
        eventType: 'DOSSIER_CLOSED',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        actorUserId,
        payload: {
          closureReviewId: review.id,
          outcome: dto.outcome,
          warningsAccepted: check.warnings.map((item) => item.code),
        },
        idempotencyKey: `DOSSIER_CLOSE:${idempotencyKey}`,
      });
      return { dossier, closureReview: review };
    });
  }

  async reopen(
    dossierId: number,
    dto: ReopenDossierDto,
    user: User,
    idempotencyKey: string,
  ): Promise<any> {
    const tenantId = getCurrentTenantId();
    const priorEvent = await this.eventRepository.findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        idempotency_key: `DOSSIER_REOPEN:${idempotencyKey}`,
      },
    });
    if (priorEvent) {
      return {
        dossier: await this.dossierRepository.findOne({
          where: { id: dossierId, tenant_id: tenantId },
        }),
      };
    }
    const actorUserId = this.actorId(user);
    const dossier = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Dossier);
      const entity = await repository
        .createQueryBuilder('dossier')
        .setLock('pessimistic_write')
        .where('dossier.id = :dossierId AND dossier.tenant_id = :tenantId', {
          dossierId,
          tenantId,
        })
        .getOne();
      if (!entity) throw new NotFoundException('Dossier introuvable');
      if (entity.lifecycle_phase !== DossierLifecyclePhase.CLOSED)
        throw new ConflictException('Le dossier n’est pas clôturé');
      entity.lifecycle_phase = DossierLifecyclePhase.TREATMENT;
      entity.status = DossierStatus.OPEN;
      entity.closing_date = null as unknown as Date;
      await repository.save(entity);
      await manager.getRepository(DossierClosureReview).save(
        manager.getRepository(DossierClosureReview).create({
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: ClosureReviewStatus.REOPENED,
          blockers: [],
          warnings: [],
          resolutions: null,
          justification: dto.reason,
          actor_user_id: actorUserId,
          checked_at: new Date(),
        }),
      );
      await this.eventService.append(manager, {
        dossierId,
        eventType: 'DOSSIER_REOPENED',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        actorUserId,
        payload: { reason: dto.reason },
        idempotencyKey: `DOSSIER_REOPEN:${idempotencyKey}`,
      });
      return entity;
    });
    const recommendation = await this.recommendationService.evaluate(
      dossierId,
      RecommendationTrigger.NO_OPEN_ACTION,
      `DOSSIER_REOPENED:${dossierId}:${dossier.updated_at?.toISOString()}`,
    );
    return { dossier, recommendation };
  }

  private mapLegacyLabel(
    label: string,
    mappings: LegacyWorkflowMapping[],
  ): string | null {
    return resolveLegacyMapping(label, mappings);
  }

  private async ensureDefaultLegacyMappings(): Promise<
    LegacyWorkflowMapping[]
  > {
    await this.catalogService.ensureDefaults();
    const tenantId = getCurrentTenantId();
    for (const item of DEFAULT_LEGACY_MAPPINGS) {
      const exists = await this.legacyMappingRepository.findOne({
        where: {
          tenant_id: tenantId,
          match_mode: 'CONTAINS',
          match_pattern: item.pattern,
        },
      });
      if (exists) continue;
      try {
        await this.legacyMappingRepository.save(
          this.legacyMappingRepository.create({
            tenant_id: tenantId,
            match_pattern: item.pattern,
            match_mode: 'CONTAINS',
            action_definition_code: item.definitionCode,
            priority: item.priority,
            is_active: true,
          }),
        );
      } catch (error) {
        const candidate = error as {
          code?: string;
          errno?: number;
          driverError?: { code?: string; errno?: number };
        };
        const duplicate =
          candidate?.code === 'ER_DUP_ENTRY' ||
          candidate?.errno === 1062 ||
          candidate?.driverError?.code === 'ER_DUP_ENTRY' ||
          candidate?.driverError?.errno === 1062;
        if (!duplicate) throw error;
      }
    }
    return this.listLegacyMappings(false);
  }

  async listLegacyMappings(seed = true): Promise<LegacyWorkflowMapping[]> {
    if (seed) return this.ensureDefaultLegacyMappings();
    return this.legacyMappingRepository.find({
      where: { tenant_id: getCurrentTenantId() },
      order: { priority: 'DESC', created_at: 'ASC' },
    });
  }

  async createLegacyMapping(
    dto: CreateLegacyWorkflowMappingDto,
  ): Promise<LegacyWorkflowMapping> {
    await this.assertActiveDefinitionCode(dto.action_definition_code);
    const tenantId = getCurrentTenantId();
    return this.legacyMappingRepository.save(
      this.legacyMappingRepository.create({
        tenant_id: tenantId,
        match_pattern: dto.match_pattern.trim(),
        match_mode: dto.match_mode,
        action_definition_code: dto.action_definition_code,
        priority: dto.priority ?? 0,
        is_active: dto.is_active ?? true,
      }),
    );
  }

  async reviseLegacyMapping(
    id: string,
    dto: ReviseLegacyWorkflowMappingDto,
  ): Promise<LegacyWorkflowMapping> {
    const mapping = await this.legacyMappingRepository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
    });
    if (!mapping)
      throw new NotFoundException('Correspondance de migration introuvable');
    if (mapping.lock_version !== dto.expected_version) {
      throw new ConflictException(
        'Cette correspondance a ete modifiee. Rechargez la configuration.',
      );
    }
    if (dto.action_definition_code)
      await this.assertActiveDefinitionCode(dto.action_definition_code);
    if (dto.match_pattern !== undefined)
      mapping.match_pattern = dto.match_pattern.trim();
    if (dto.match_mode !== undefined) mapping.match_mode = dto.match_mode;
    if (dto.action_definition_code !== undefined)
      mapping.action_definition_code = dto.action_definition_code;
    if (dto.priority !== undefined) mapping.priority = dto.priority;
    if (dto.is_active !== undefined) mapping.is_active = dto.is_active;
    return this.legacyMappingRepository.save(mapping);
  }

  private async assertActiveDefinitionCode(code: string): Promise<void> {
    await this.catalogService.ensureDefaults();
    const definition = await this.definitionRepository.findOne({
      where: { tenant_id: getCurrentTenantId(), code, is_active: true },
    });
    if (!definition)
      throw new BadRequestException(
        `Definition d'action active introuvable pour le code ${code}`,
      );
  }

  async previewMigration(
    dossierId: number,
    user: User,
  ): Promise<CaseWorkflowMigrationRun> {
    await this.catalogService.ensureDefaults();
    const tenantId = getCurrentTenantId();
    const dossier = await this.dossierRepository.findOne({
      where: { id: dossierId, tenant_id: tenantId },
      relations: [
        'steps',
        'procedureInstance',
        'procedureInstance.currentStage',
      ],
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    if (dossier.workflow_engine === WorkflowEngine.ACTIONS_V2)
      throw new ConflictException('Le dossier utilise déjà le parcours V2');
    const mappings = (await this.ensureDefaultLegacyMappings()).filter(
      (mapping) => mapping.is_active,
    );
    const mappingVersion = `curated-db-v1:${mappings.reduce((sum, mapping) => sum + mapping.lock_version, 0)}`;
    const existingPreview = await this.migrationRepository.findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: MigrationRunStatus.PREVIEWED,
      },
      order: { created_at: 'DESC' },
    });
    if (existingPreview?.mapping_version === mappingVersion)
      return existingPreview;
    if (existingPreview) {
      existingPreview.status = MigrationRunStatus.ROLLED_BACK;
      existingPreview.rolled_back_at = new Date();
      await this.migrationRepository.save(existingPreview);
    }
    const legacySteps = (dossier.steps ?? []).map((step) => ({
      id: step.id,
      title: step.title ?? `Étape ${step.id}`,
      status: step.status,
      dueDate: step.metadata?.deadline ?? step.scheduledDate ?? null,
      createdAt: step.created_at ?? null,
      updatedAt: step.updated_at ?? null,
      completedAt: step.completedDate ?? null,
    }));
    const currentStage = dossier.procedureInstance?.currentStage;
    const labels = [
      currentStage?.name,
      ...legacySteps
        .filter((step) => step.status !== StepStatus.COMPLETED)
        .map((step) => step.title),
    ].filter(
      (label): label is string =>
        typeof label === 'string' && label.trim().length > 0,
    );
    const proposedActions = labels.map((label) => {
      const definitionCode = this.mapLegacyLabel(label, mappings);
      return {
        legacyLabel: label,
        definitionCode,
        requiresMapping: !definitionCode,
      };
    });
    const legacySnapshot = {
      procedureInstanceId: dossier.procedureInstanceId,
      procedureInstance: dossier.procedureInstance
        ? {
            id: dossier.procedureInstance.id,
            status: dossier.procedureInstance.status,
            currentStageId: dossier.procedureInstance.currentStageId,
            currentStageName: currentStage?.name,
          }
        : null,
      steps: legacySteps,
      capturedAt: new Date().toISOString(),
    };
    return this.migrationRepository.save(
      this.migrationRepository.create({
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: MigrationRunStatus.PREVIEWED,
        mapping_version: mappingVersion,
        legacy_snapshot: legacySnapshot,
        preview_result: {
          proposedActions,
          unmappedCount: proposedActions.filter((item) => item.requiresMapping)
            .length,
        },
        applied_action_ids: null,
        actor_user_id: this.actorId(user),
        confirmed_at: null,
        rolled_back_at: null,
      }),
    );
  }

  async applyMigration(
    dossierId: number,
    dto: ApplyWorkflowMigrationDto,
    user: User,
  ): Promise<CaseWorkflowMigrationRun> {
    await this.catalogService.ensureDefaults();
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const migrationRepo = manager.getRepository(CaseWorkflowMigrationRun);
      const run = await migrationRepo
        .createQueryBuilder('run')
        .setLock('pessimistic_write')
        .where(
          'run.id = :runId AND run.dossier_id = :dossierId AND run.tenant_id = :tenantId',
          { runId: dto.migration_run_id, dossierId, tenantId },
        )
        .getOne();
      if (!run) throw new NotFoundException('Aperçu de migration introuvable');
      if (
        run.status === MigrationRunStatus.APPLIED ||
        run.status === MigrationRunStatus.CONFIRMED
      )
        return run;
      if (run.status !== MigrationRunStatus.PREVIEWED)
        throw new ConflictException('Cet aperçu ne peut pas être appliqué');
      const proposed = this.readProposedActions(run.preview_result);
      if (proposed.some((item) => item.requiresMapping))
        throw new BadRequestException(
          'La table de correspondance doit être complétée avant application',
        );
      const definitionCodes = [
        ...new Set(
          proposed
            .map((item) => item.definitionCode)
            .filter((code): code is string => Boolean(code)),
        ),
      ];
      const definitions = await manager.getRepository(ActionDefinition).find({
        where: {
          tenant_id: tenantId,
          code: In(definitionCodes),
          is_active: true,
        },
      });
      const byCode = new Map(
        definitions.map((definition) => [definition.code, definition]),
      );
      const actionRepo = manager.getRepository(DossierAction);
      const actionIds: string[] = [];
      for (let index = 0; index < proposed.length; index++) {
        const item = proposed[index];
        const definition = byCode.get(item.definitionCode!);
        if (!definition)
          throw new BadRequestException(
            `Définition ${item.definitionCode} introuvable`,
          );
        const idempotencyKey = `MIGRATION:${run.id}:${index}`;
        let action = await actionRepo.findOne({
          where: { tenant_id: tenantId, idempotency_key: idempotencyKey },
        });
        if (!action) {
          action = await actionRepo.save(
            actionRepo.create({
              tenant_id: tenantId,
              dossier_id: dossierId,
              definition_id: definition.id,
              definition_code: definition.code,
              definition_label: definition.label,
              definition_version: definition.version,
              title: item.legacyLabel,
              responsible_user_id: this.actorId(user),
              status: DossierActionStatus.TODO,
              priority: definition.default_priority,
              is_required: definition.is_required,
              planned_at: new Date(),
              due_at:
                definition.default_due_days == null
                  ? null
                  : new Date(
                      Date.now() + definition.default_due_days * 86_400_000,
                    ),
              specific_data: {
                migrationRunId: run.id,
                legacyLabel: item.legacyLabel,
              },
              source_recommendation_id: null,
              idempotency_key: idempotencyKey,
            }),
          );
        }
        actionIds.push(action.id);
      }
      const dossier = await manager
        .getRepository(Dossier)
        .findOne({ where: { id: dossierId, tenant_id: tenantId } });
      if (!dossier) throw new NotFoundException('Dossier introuvable');
      dossier.workflow_engine = WorkflowEngine.ACTIONS_V2;
      dossier.lifecycle_phase =
        dossier.status === DossierStatus.CLOSED
          ? DossierLifecyclePhase.CLOSED
          : DossierLifecyclePhase.TREATMENT;
      dossier.opening_validated_at = dossier.opening_validated_at ?? new Date();
      dossier.opening_validated_by =
        dossier.opening_validated_by ?? this.actorId(user);
      dossier.legacy_workflow_locked = false;
      await manager.getRepository(Dossier).save(dossier);
      run.status = MigrationRunStatus.APPLIED;
      run.applied_action_ids = actionIds;
      await migrationRepo.save(run);
      const snapshotSteps = run.legacy_snapshot.steps;
      const importedSteps = Array.isArray(snapshotSteps)
        ? snapshotSteps.filter(
            (step): step is Record<string, unknown> =>
              Boolean(step) && typeof step === 'object',
          )
        : [];
      for (const legacyStep of importedSteps) {
        const legacyStepId =
          typeof legacyStep.id === 'string' || typeof legacyStep.id === 'number'
            ? String(legacyStep.id)
            : 'unknown';
        await this.eventService.append(manager, {
          dossierId,
          eventType: 'LEGACY_STEP_IMPORTED',
          aggregateType: 'LegacyStep',
          aggregateId: legacyStepId,
          actorUserId: this.actorId(user),
          payload: { ...legacyStep, migrationRunId: run.id, inherited: true },
          idempotencyKey: `MIGRATION_HISTORY:${run.id}:STEP:${legacyStepId}`,
          occurredAt:
            legacyStep.completedAt ||
            legacyStep.updatedAt ||
            legacyStep.createdAt
              ? new Date(
                  String(
                    legacyStep.completedAt ??
                      legacyStep.updatedAt ??
                      legacyStep.createdAt,
                  ),
                )
              : new Date(),
        });
      }
      await this.eventService.append(manager, {
        dossierId,
        eventType: 'DOSSIER_WORKFLOW_MIGRATED',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        actorUserId: this.actorId(user),
        payload: { migrationRunId: run.id, actionIds },
        idempotencyKey: `MIGRATION_APPLY:${run.id}`,
      });
      return run;
    });
  }

  async confirmMigration(
    dossierId: number,
    dto: ApplyWorkflowMigrationDto,
    user: User,
  ): Promise<CaseWorkflowMigrationRun> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CaseWorkflowMigrationRun);
      const run = await repository
        .createQueryBuilder('run')
        .setLock('pessimistic_write')
        .where(
          'run.id = :runId AND run.dossier_id = :dossierId AND run.tenant_id = :tenantId',
          { runId: dto.migration_run_id, dossierId, tenantId },
        )
        .getOne();
      if (!run) throw new NotFoundException('Migration introuvable');
      if (
        run.status !== MigrationRunStatus.APPLIED &&
        run.status !== MigrationRunStatus.CONFIRMED
      )
        throw new ConflictException('La migration doit d’abord être appliquée');
      run.status = MigrationRunStatus.CONFIRMED;
      run.confirmed_at = run.confirmed_at ?? new Date();
      const dossier = await manager
        .getRepository(Dossier)
        .findOne({ where: { id: dossierId, tenant_id: tenantId } });
      if (!dossier) throw new NotFoundException('Dossier introuvable');
      dossier.legacy_workflow_locked = true;
      await manager.getRepository(Dossier).save(dossier);
      await this.eventService.append(manager, {
        dossierId,
        eventType: 'DOSSIER_WORKFLOW_MIGRATION_CONFIRMED',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        actorUserId: this.actorId(user),
        payload: { migrationRunId: run.id },
        idempotencyKey: `MIGRATION_CONFIRM:${run.id}`,
      });
      return repository.save(run);
    });
  }

  async rollbackMigration(
    dossierId: number,
    dto: ApplyWorkflowMigrationDto,
    user: User,
  ): Promise<CaseWorkflowMigrationRun> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(CaseWorkflowMigrationRun);
      const run = await repository
        .createQueryBuilder('run')
        .setLock('pessimistic_write')
        .where(
          'run.id = :runId AND run.dossier_id = :dossierId AND run.tenant_id = :tenantId',
          { runId: dto.migration_run_id, dossierId, tenantId },
        )
        .getOne();
      if (!run) throw new NotFoundException('Migration introuvable');
      if (run.status === MigrationRunStatus.ROLLED_BACK) return run;
      if (run.status !== MigrationRunStatus.APPLIED)
        throw new ConflictException(
          'Seule une migration appliquée et non confirmée peut être annulée',
        );
      const nonMigrationMutation = await manager
        .getRepository(DossierAction)
        .createQueryBuilder('action')
        .where(
          'action.tenant_id = :tenantId AND action.dossier_id = :dossierId',
          { tenantId, dossierId },
        )
        .andWhere(
          '(action.idempotency_key IS NULL OR action.idempotency_key NOT LIKE :prefix)',
          { prefix: `MIGRATION:${run.id}:%` },
        )
        .getCount();
      if (nonMigrationMutation)
        throw new ConflictException(
          'Rollback impossible après la première mutation V2',
        );
      if (run.applied_action_ids?.length)
        await manager
          .getRepository(DossierAction)
          .softDelete({ id: In(run.applied_action_ids), tenant_id: tenantId });
      const dossier = await manager
        .getRepository(Dossier)
        .findOne({ where: { id: dossierId, tenant_id: tenantId } });
      if (!dossier) throw new NotFoundException('Dossier introuvable');
      dossier.workflow_engine = WorkflowEngine.LEGACY;
      dossier.lifecycle_phase =
        dossier.status === DossierStatus.CLOSED
          ? DossierLifecyclePhase.CLOSED
          : DossierLifecyclePhase.OPENING;
      dossier.legacy_workflow_locked = false;
      await manager.getRepository(Dossier).save(dossier);
      run.status = MigrationRunStatus.ROLLED_BACK;
      run.rolled_back_at = new Date();
      await this.eventService.append(manager, {
        dossierId,
        eventType: 'DOSSIER_WORKFLOW_MIGRATION_ROLLED_BACK',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        actorUserId: this.actorId(user),
        payload: { migrationRunId: run.id },
        idempotencyKey: `MIGRATION_ROLLBACK:${run.id}`,
      });
      return repository.save(run);
    });
  }
}
