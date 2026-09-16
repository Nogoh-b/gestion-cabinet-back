import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { NotificationService } from 'src/modules/notification/notification.service';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import {
  DossierActionStatus,
  DossierLifecyclePhase,
  RecommendationTrigger,
  WorkflowEngine,
} from '../case-workflow.enums';
import { getActionDeadlineState } from '../case-workflow.logic';
import { DossierAction } from '../entities/dossier-action.entity';
import {
  CaseWorkflowEvent,
  CaseWorkflowOutbox,
} from '../entities/workflow-audit.entity';
import { RecommendationService } from './recommendation.service';
import { WorkflowEventService } from './workflow-event.service';
import { CaseBillingService } from './case-billing.service';

const SYSTEM_SENDER_ID = 1;
const DEFAULT_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CaseWorkflowScheduler {
  private readonly logger = new Logger(CaseWorkflowScheduler.name);
  private workflowCheckRunning = false;
  private outboxRunning = false;

  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(DossierAction)
    private readonly actionRepository: Repository<DossierAction>,
    @InjectRepository(CaseWorkflowEvent)
    private readonly eventRepository: Repository<CaseWorkflowEvent>,
    @InjectRepository(CaseWorkflowOutbox)
    private readonly outboxRepository: Repository<CaseWorkflowOutbox>,
    private readonly recommendationService: RecommendationService,
    private readonly eventService: WorkflowEventService,
    private readonly billingService: CaseBillingService,
    private readonly notifications: NotificationService,
    private readonly tenantContext: TenantContext,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Réévalue les règles et envoie les rappels d’action sans attendre l’ouverture de la fiche. */
  @Cron('0 */5 * * * *')
  async runWorkflowChecks(): Promise<void> {
    if (this.workflowCheckRunning) return;
    this.workflowCheckRunning = true;
    try {
      await this.forEachActiveCabinet((cabinetId) =>
        this.checkTenant(cabinetId),
      );
    } finally {
      this.workflowCheckRunning = false;
    }
  }

  /** Publie durablement les événements du workflow vers le bus applicatif. */
  @Cron('*/30 * * * * *')
  async processOutbox(): Promise<void> {
    if (this.outboxRunning) return;
    this.outboxRunning = true;
    try {
      await this.forEachActiveCabinet((cabinetId) =>
        this.processTenantOutbox(cabinetId),
      );
    } finally {
      this.outboxRunning = false;
    }
  }

  private async forEachActiveCabinet(
    task: (cabinetId: number) => Promise<void>,
  ): Promise<void> {
    const cabinets = await this.tenantContext.runWithoutTenant(() =>
      this.cabinetRepository.find({
        where: { status: In(['active', 'trial']) },
        select: ['id'],
      }),
    );
    for (const cabinet of cabinets) {
      try {
        await this.tenantContext.run(cabinet.id, () => task(cabinet.id));
      } catch (error) {
        this.logger.error(
          `Workflow automatique cabinet=${cabinet.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async checkTenant(tenantId: number): Promise<void> {
    const dossiers = await this.dossierRepository.find({
      where: {
        tenant_id: tenantId,
        workflow_engine: WorkflowEngine.ACTIONS_V2,
        lifecycle_phase: DossierLifecyclePhase.TREATMENT,
      },
      relations: [
        'lawyer',
        'lawyer.user',
        'collaborators',
        'collaborators.user',
      ],
    });
    for (const dossier of dossiers) {
      await this.sendDueActionReminders(dossier, tenantId);
      await this.billingService.syncAudienceItems(dossier.id);
      await this.billingService.syncDiligenceItems(dossier.id);
      const recommendation = await this.recommendationService.evaluate(
        dossier.id,
        RecommendationTrigger.MANUAL,
        `SCHEDULED_EVALUATION:${dossier.id}`,
      );
      if (recommendation)
        await this.notifyRecommendation(
          dossier,
          recommendation.id,
          recommendation.reason,
          recommendation.action_definition?.label,
        );
    }
  }

  private async sendDueActionReminders(
    dossier: Dossier,
    tenantId: number,
  ): Promise<boolean> {
    const actions = await this.actionRepository.find({
      where: {
        tenant_id: tenantId,
        dossier_id: dossier.id,
        status: In([
          DossierActionStatus.TODO,
          DossierActionStatus.IN_PROGRESS,
          DossierActionStatus.ON_HOLD,
        ]),
      },
    });
    const now = Date.now();
    let hasOverdueAction = false;
    for (const action of actions) {
      if (!action.due_at) continue;
      const deadlineState = getActionDeadlineState(action, now);
      hasOverdueAction ||= deadlineState.isOverdue;
      const recipients = this.uniqueIds([
        action.responsible_user_id,
        dossier.lawyer?.user?.id,
        ...(dossier.collaborators ?? []).map((employee) => employee.user?.id),
      ]);

      if (deadlineState.isOverdue) {
        const overdueEventKey = `ACTION_OVERDUE_NOTIFICATION:${action.id}:${action.due_at.toISOString()}`;
        const alreadyNotified = await this.eventRepository.findOne({
          where: {
            tenant_id: tenantId,
            idempotency_key: overdueEventKey,
          },
        });
        if (alreadyNotified || recipients.length === 0) continue;

        await this.notifications.createBulk(
          {
            user_ids: recipients,
            type: NotificationType.DOSSIER_DEADLINE,
            title: `Action en retard — ${action.title}`,
            content: `Dossier ${dossier.dossier_number} · en retard de ${deadlineState.overdueDays} jour(s) · échéance ${action.due_at.toLocaleString('fr-FR')}`,
            data: {
              dossierId: dossier.id,
              actionId: action.id,
              dueAt: action.due_at.toISOString(),
              overdueDays: deadlineState.overdueDays,
            },
            link: `/dossiers/${dossier.id}`,
            priority: 'URGENT',
          },
          SYSTEM_SENDER_ID,
        );
        await this.eventService.append(this.actionRepository.manager, {
          dossierId: dossier.id,
          eventType: 'DOSSIER_ACTION_OVERDUE_NOTIFIED',
          aggregateType: 'DossierAction',
          aggregateId: action.id,
          actorUserId: null,
          payload: {
            dueAt: action.due_at.toISOString(),
            overdueDays: deadlineState.overdueDays,
          },
          idempotencyKey: overdueEventKey,
        });
        continue;
      }

      if (action.reminder_sent_at) continue;
      const reminderTime =
        action.remind_at?.getTime() ??
        action.due_at.getTime() - DEFAULT_REMINDER_LEAD_MS;
      if (reminderTime > now) continue;
      if (recipients.length) {
        await this.notifications.createBulk(
          {
            user_ids: recipients,
            type: NotificationType.DOSSIER_DEADLINE,
            title: `Échéance proche — ${action.title}`,
            content: `Dossier ${dossier.dossier_number} · échéance ${action.due_at.toLocaleString('fr-FR')}`,
            data: {
              dossierId: dossier.id,
              actionId: action.id,
              dueAt: action.due_at.toISOString(),
            },
            link: `/dossiers/${dossier.id}`,
            priority: 'HIGH',
          },
          SYSTEM_SENDER_ID,
        );
      }
      await this.actionRepository.query(
        'UPDATE dossier_actions SET reminder_sent_at = ? WHERE id = ? AND tenant_id = ? AND reminder_sent_at IS NULL',
        [new Date(), action.id, tenantId],
      );
      await this.eventService.append(this.actionRepository.manager, {
        dossierId: dossier.id,
        eventType: 'DOSSIER_ACTION_REMINDER_SENT',
        aggregateType: 'DossierAction',
        aggregateId: action.id,
        actorUserId: null,
        payload: {
          dueAt: action.due_at.toISOString(),
          remindAt: action.remind_at?.toISOString() ?? null,
        },
        idempotencyKey: `ACTION_REMINDER:${action.id}:${action.due_at.toISOString()}`,
      });
    }
    return hasOverdueAction;
  }

  private async notifyRecommendation(
    dossier: Dossier,
    recommendationId: string,
    reason: string,
    label?: string,
  ): Promise<void> {
    const eventKey = `RECOMMENDATION_NOTIFICATION:${recommendationId}`;
    if (
      await this.eventRepository.findOne({
        where: { tenant_id: dossier.tenant_id, idempotency_key: eventKey },
      })
    )
      return;
    const recipients = this.uniqueIds([
      dossier.lawyer?.user?.id,
      ...(dossier.collaborators ?? []).map((employee) => employee.user?.id),
    ]);
    if (recipients.length) {
      await this.notifications.createBulk(
        {
          user_ids: recipients,
          type: NotificationType.SYSTEM,
          title: `Prochaine action — ${label ?? 'dossier à traiter'}`,
          content: reason,
          data: { dossierId: dossier.id, recommendationId },
          link: `/dossiers/${dossier.id}`,
          priority: 'NORMAL',
        },
        SYSTEM_SENDER_ID,
      );
    }
    await this.eventService.append(this.eventRepository.manager, {
      dossierId: dossier.id,
      eventType: 'DOSSIER_RECOMMENDATION_NOTIFIED',
      aggregateType: 'DossierRecommendation',
      aggregateId: recommendationId,
      actorUserId: null,
      payload: { label: label ?? null },
      idempotencyKey: eventKey,
    });
  }

  private async processTenantOutbox(tenantId: number): Promise<void> {
    const records = await this.outboxRepository.find({
      where: {
        tenant_id: tenantId,
        processed_at: IsNull(),
        available_at: LessThanOrEqual(new Date()),
      },
      order: { available_at: 'ASC' },
      take: 100,
    });
    for (const record of records) {
      try {
        await this.eventEmitter.emitAsync(
          `case-workflow.${record.event_type.toLowerCase()}`,
          record.payload,
        );
        record.processed_at = new Date();
        record.attempts += 1;
      } catch (error) {
        record.attempts += 1;
        record.available_at = new Date(
          Date.now() + Math.min(record.attempts, 10) * 60_000,
        );
        this.logger.error(`Outbox ${record.id}: ${(error as Error).message}`);
      }
      await this.outboxRepository.save(record);
    }
  }

  private uniqueIds(values: Array<number | null | undefined>): number[] {
    return [
      ...new Set(
        values
          .map(Number)
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ];
  }
}
