import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as jsonLogic from 'json-logic-js';
import type { AdditionalOperation, RulesLogic } from 'json-logic-js';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  Audience,
  AudienceStatus,
} from 'src/modules/audiences/entities/audience.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { EntityManager, In, Repository } from 'typeorm';
import {
  DossierActionStatus,
  RecommendationStatus,
  RecommendationTrigger,
} from '../case-workflow.enums';
import { DossierAction } from '../entities/dossier-action.entity';
import {
  DossierRecommendation,
  RecommendationRule,
} from '../entities/recommendation.entity';
import { ActionCatalogService } from './action-catalog.service';
import {
  findForbiddenJsonLogicOperator,
  recommendationScore,
} from '../case-workflow.logic';

type RecommendationContext = Record<string, unknown> & {
  dossier: {
    id: number;
    lifecyclePhase: Dossier['lifecycle_phase'];
    status: Dossier['status'];
    dangerLevel: number;
    priorityLevel: number;
  };
  actions: { openCount: number; openDefinitionCodes: string[] };
  audiences: {
    activeCount: number;
    postponedCount: number;
    nextInDays: number;
  };
  documents: {
    pendingReview: boolean;
    awaitingSignature: boolean;
    missingCount: number;
  };
  negotiation: { followUpDue: boolean };
};

@Injectable()
export class RecommendationService {
  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(DossierAction)
    private readonly actionRepository: Repository<DossierAction>,
    @InjectRepository(Audience)
    private readonly audienceRepository: Repository<Audience>,
    @InjectRepository(DocumentCustomer)
    private readonly documentRepository: Repository<DocumentCustomer>,
    @InjectRepository(RecommendationRule)
    private readonly ruleRepository: Repository<RecommendationRule>,
    @InjectRepository(DossierRecommendation)
    private readonly recommendationRepository: Repository<DossierRecommendation>,
    private readonly catalogService: ActionCatalogService,
  ) {}

  private assertAllowedOperators(value: unknown): void {
    const forbidden = findForbiddenJsonLogicOperator(value);
    if (forbidden)
      throw new BadRequestException(
        `Opérateur json-logic non autorisé: ${forbidden}`,
      );
  }

  async buildContext(
    dossierId: number,
    manager?: EntityManager,
  ): Promise<RecommendationContext> {
    const tenantId = getCurrentTenantId();
    const dossierRepo =
      manager?.getRepository(Dossier) ?? this.dossierRepository;
    const actionRepo =
      manager?.getRepository(DossierAction) ?? this.actionRepository;
    const audienceRepo =
      manager?.getRepository(Audience) ?? this.audienceRepository;
    const documentRepo =
      manager?.getRepository(DocumentCustomer) ?? this.documentRepository;

    const dossier = await dossierRepo.findOne({
      where: { id: dossierId, tenant_id: tenantId },
    });
    if (!dossier)
      throw new BadRequestException(`Dossier ${dossierId} introuvable`);

    const [actions, audiences, documents] = await Promise.all([
      actionRepo.find({
        where: {
          tenant_id: tenantId,
          dossier_id: dossierId,
        },
        order: { created_at: 'ASC' },
      }),
      audienceRepo.find({
        where: { tenant_id: tenantId, dossier_id: String(dossierId) },
      }),
      documentRepo.find({
        where: { tenant_id: tenantId, dossier_id: dossierId },
      }),
    ]);

    const openCount = actions.filter((action) =>
      [
        DossierActionStatus.TODO,
        DossierActionStatus.IN_PROGRESS,
        DossierActionStatus.ON_HOLD,
      ].includes(action.status),
    ).length;
    const openDefinitionCodes = actions
      .filter((action) =>
        [
          DossierActionStatus.TODO,
          DossierActionStatus.IN_PROGRESS,
          DossierActionStatus.ON_HOLD,
        ].includes(action.status),
      )
      .map((action) => action.definition_code);

    const activeAudiences = audiences.filter((item) =>
      [AudienceStatus.SCHEDULED, AudienceStatus.POSTPONED].includes(
        item.status,
      ),
    );
    const dates = activeAudiences
      .map((item) => new Date(item.postponed_to ?? item.audience_date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    const nextInDays = dates.length
      ? Math.ceil((dates[0].getTime() - Date.now()) / 86_400_000)
      : 99999;

    const lastApprovedDraft = [...actions]
      .reverse()
      .find(
        (action) =>
          action.status === DossierActionStatus.COMPLETED &&
          ['REVIEW_DRAFT', 'VALIDATE_DOCUMENT'].includes(
            action.definition_code,
          ) &&
          ['APPROVED', 'COMPLETED'].includes(action.result_code ?? ''),
      );
    const lastSignature = [...actions]
      .reverse()
      .find(
        (action) =>
          action.status === DossierActionStatus.COMPLETED &&
          ['SIGN_DOCUMENT', 'SIGN_SETTLEMENT_AGREEMENT'].includes(
            action.definition_code,
          ) &&
          ['SIGNED', 'COMPLETED'].includes(action.result_code ?? ''),
      );
    const awaitingSignatureFromMetadata = documents.some((item) => {
      const metadata = item.metadata as Record<string, unknown> | null;
      return (
        metadata?.requires_signature === true && metadata?.signed_at == null
      );
    });
    const awaitingSignature =
      awaitingSignatureFromMetadata ||
      Boolean(
        lastApprovedDraft &&
          (!lastSignature ||
            lastSignature.completed_at!.getTime() <
              lastApprovedDraft.completed_at!.getTime()),
      );
    const lastDraft = [...actions]
      .reverse()
      .find(
        (action) =>
          action.status === DossierActionStatus.COMPLETED &&
          [
            'PREPARE_DOCUMENT_DRAFT',
            'DRAFT_PROCEDURAL_DOCUMENT',
            'DRAFT_FORMAL_LETTER',
            'DRAFT_AGREEMENT',
          ].includes(action.definition_code),
      );
    const lastReview = [...actions]
      .reverse()
      .find(
        (action) =>
          action.status === DossierActionStatus.COMPLETED &&
          action.definition_code === 'REVIEW_DRAFT',
      );
    const pendingReview =
      documents.some(
        (item) => item.status === DocumentCustomerStatus.PENDING,
      ) ||
      Boolean(
        lastDraft &&
          (!lastReview ||
            lastReview.completed_at!.getTime() <
              lastDraft.completed_at!.getTime()),
      );
    const missingCount = documents.filter(
      (item) =>
        item.required_for_hearing &&
        item.status !== DocumentCustomerStatus.ACCEPTED,
    ).length;
    const lastSettlementProposal = [...actions]
      .reverse()
      .find(
        (action) =>
          action.status === DossierActionStatus.COMPLETED &&
          action.definition_code === 'SEND_SETTLEMENT_PROPOSAL',
      );
    const lastSettlementFollowUp = [...actions]
      .reverse()
      .find(
        (action) => action.definition_code === 'FOLLOW_UP_SETTLEMENT_PROPOSAL',
      );
    const followUpValue =
      lastSettlementProposal?.specific_data?.responseDueAt ??
      lastSettlementProposal?.specific_data?.followUpDueAt ??
      lastSettlementProposal?.due_at;
    const followUpDate =
      followUpValue instanceof Date
        ? new Date(followUpValue.getTime())
        : typeof followUpValue === 'string'
          ? new Date(followUpValue)
          : typeof followUpValue === 'number'
            ? new Date(followUpValue)
            : null;
    const followUpDue = Boolean(
      lastSettlementProposal &&
        followUpDate &&
        !Number.isNaN(followUpDate.getTime()) &&
        followUpDate.getTime() <= Date.now() &&
        (!lastSettlementFollowUp ||
          lastSettlementFollowUp.created_at.getTime() <
            lastSettlementProposal.completed_at!.getTime()),
    );

    return {
      dossier: {
        id: dossier.id,
        lifecyclePhase: dossier.lifecycle_phase,
        status: dossier.status,
        dangerLevel: Number(dossier.danger_level ?? 0),
        priorityLevel: Number(dossier.priority_level ?? 0),
      },
      actions: { openCount, openDefinitionCodes },
      audiences: {
        activeCount: activeAudiences.length,
        postponedCount: audiences.filter(
          (item) => item.status === AudienceStatus.POSTPONED,
        ).length,
        nextInDays,
      },
      documents: {
        pendingReview,
        awaitingSignature,
        missingCount,
      },
      negotiation: {
        followUpDue,
      },
    };
  }

  async evaluate(
    dossierId: number,
    trigger: RecommendationTrigger,
    sourceEventKey: string,
    manager?: EntityManager,
  ): Promise<DossierRecommendation | null> {
    await this.catalogService.ensureDefaults();
    const tenantId = getCurrentTenantId();
    const ruleRepo =
      manager?.getRepository(RecommendationRule) ?? this.ruleRepository;
    const recommendationRepo =
      manager?.getRepository(DossierRecommendation) ??
      this.recommendationRepository;
    const context = await this.buildContext(dossierId, manager);
    const deferred = await recommendationRepo.findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: RecommendationStatus.DEFERRED,
      },
      order: { remind_at: 'DESC' },
    });
    if (deferred?.remind_at && deferred.remind_at.getTime() > Date.now())
      return null;
    if (deferred) deferred.status = RecommendationStatus.SUPERSEDED;
    if (deferred) await recommendationRepo.save(deferred);

    const triggers =
      trigger === RecommendationTrigger.MANUAL
        ? Object.values(RecommendationTrigger).filter(
            (value) => value !== RecommendationTrigger.MANUAL,
          )
        : trigger === RecommendationTrigger.NO_OPEN_ACTION
          ? [RecommendationTrigger.NO_OPEN_ACTION]
          : [trigger, RecommendationTrigger.NO_OPEN_ACTION];
    const rules = await ruleRepo.find({
      where: { tenant_id: tenantId, trigger: In(triggers), is_active: true },
      relations: ['action_definition'],
    });

    const candidates = rules.filter((rule) => {
      this.assertAllowedOperators(rule.condition_json);
      return (
        !context.actions.openDefinitionCodes.includes(
          rule.action_definition?.code,
        ) &&
        Boolean(
          jsonLogic.apply(
            rule.condition_json as RulesLogic<AdditionalOperation>,
            context,
          ),
        )
      );
    });
    if (!candidates.length) {
      await recommendationRepo.update(
        {
          tenant_id: tenantId,
          dossier_id: dossierId,
          status: RecommendationStatus.ACTIVE,
        },
        { status: RecommendationStatus.SUPERSEDED },
      );
      return null;
    }

    candidates.sort((left, right) => {
      const common = {
        dangerLevel: context.dossier.dangerLevel,
        dossierPriority: context.dossier.priorityLevel,
        nextDeadlineInDays: context.audiences.nextInDays,
      };
      const leftScore = recommendationScore({
        ...common,
        rulePriority: left.priority,
        specificity: left.specificity,
      });
      const rightScore = recommendationScore({
        ...common,
        rulePriority: right.priority,
        specificity: right.specificity,
      });
      return rightScore - leftScore;
    });
    const winner = candidates[0];
    const currentWinner = await recommendationRepo.findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: RecommendationStatus.ACTIVE,
        rule_code: winner.code,
        rule_version: winner.version,
      },
      relations: ['action_definition', 'action_definition.family'],
      order: { created_at: 'DESC' },
    });
    if (currentWinner) return currentWinner;
    const winnerEventKey = `${sourceEventKey}:${winner.code}:v${winner.version}`;
    const prior = await recommendationRepo.findOne({
      where: {
        tenant_id: tenantId,
        source_event_key: winnerEventKey,
        rule_version: winner.version,
      },
      relations: ['action_definition'],
    });
    if (
      prior &&
      [RecommendationStatus.ACTIVE, RecommendationStatus.DEFERRED].includes(
        prior.status,
      )
    )
      return prior;
    if (prior) return null;

    await recommendationRepo.update(
      {
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: RecommendationStatus.ACTIVE,
      },
      { status: RecommendationStatus.SUPERSEDED },
    );

    const dueAt =
      winner.due_offset_days == null
        ? null
        : new Date(Date.now() + winner.due_offset_days * 86_400_000);
    const saved = await recommendationRepo.save(
      recommendationRepo.create({
        tenant_id: tenantId,
        dossier_id: dossierId,
        rule_id: winner.id,
        rule_code: winner.code,
        rule_version: winner.version,
        action_definition_id: winner.action_definition_id,
        reason: winner.reason_template,
        status: RecommendationStatus.ACTIVE,
        score: recommendationScore({
          dangerLevel: context.dossier.dangerLevel,
          dossierPriority: context.dossier.priorityLevel,
          nextDeadlineInDays: context.audiences.nextInDays,
          rulePriority: winner.priority,
          specificity: winner.specificity,
        }),
        due_at: dueAt,
        remind_at: null,
        context_snapshot: context,
        source_event_key: winnerEventKey,
      }),
    );
    // save() ne recharge pas les relations. Le premier workspace suivant
    // l'ouverture doit pourtant déjà pouvoir afficher le libellé de l'action.
    saved.action_definition = winner.action_definition;
    return saved;
  }

  async getCurrent(dossierId: number): Promise<DossierRecommendation | null> {
    const tenantId = getCurrentTenantId();
    return this.recommendationRepository.findOne({
      where: {
        tenant_id: tenantId,
        dossier_id: dossierId,
        status: RecommendationStatus.ACTIVE,
      },
      relations: ['action_definition', 'action_definition.family'],
      order: { score: 'DESC', created_at: 'DESC' },
    });
  }
}
