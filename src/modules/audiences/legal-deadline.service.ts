import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { ResourceActor } from 'src/core/resource-policy.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { RecordLegalNotificationDto } from './dto/legal-deadline.dto';
import {
  Audience,
  AudienceRecordStatus,
} from './entities/audience.entity';
import {
  LegalDeadline,
  LegalDeadlineStatus,
} from './entities/legal-deadline.entity';
import {
  LegalDeadlineDurationUnit,
  LegalDeadlineRule,
  LegalDeadlineRuleStatus,
} from './entities/legal-deadline-rule.entity';

@Injectable()
export class LegalDeadlineService {
  constructor(
    @InjectRepository(LegalDeadline)
    private readonly repository: Repository<LegalDeadline>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async getDossierId(id: number): Promise<number> {
    const deadline = await this.repository.findOne({
      where: { id },
      select: ['id', 'dossierId'],
    });
    if (!deadline) throw new NotFoundException(`Délai ${id} introuvable`);
    return Number(deadline.dossierId);
  }

  async getAudienceDossierId(audienceId: number): Promise<number> {
    const rows = await this.dataSource.getRepository(Audience).findOne({
      where: { id: audienceId },
      select: ['id', 'dossier_id'],
    });
    if (!rows) {
      throw new NotFoundException(`Audience ${audienceId} introuvable`);
    }
    return Number(rows.dossier_id);
  }

  findByAudience(audienceId: number): Promise<LegalDeadline[]> {
    return this.repository.find({
      where: { audienceId },
      relations: ['rule'],
      order: { dueAtUtc: 'ASC' },
    });
  }

  async findOne(id: number): Promise<LegalDeadline> {
    const deadline = await this.repository.findOne({
      where: { id },
      relations: ['rule', 'audience'],
    });
    if (!deadline) throw new NotFoundException(`Délai ${id} introuvable`);
    return deadline;
  }

  /**
   * Matérialise un délai à partir de la notification d'une décision scellée.
   * Le résultat garde une copie des paramètres de règle et ne dépend donc plus
   * d'une configuration mutable.
   */
  async recordNotification(
    dto: RecordLegalNotificationDto,
    actor: ResourceActor,
  ): Promise<LegalDeadline> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const tenantId = getCurrentTenantId();
      const audience = await manager.findOne(Audience, {
        where: { id: dto.audience_id, tenant_id: tenantId },
        relations: ['dossier'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!audience) {
        throw new NotFoundException(`Audience ${dto.audience_id} introuvable`);
      }
      if (audience.decision_record_status !== AudienceRecordStatus.SEALED) {
        throw new BadRequestException(
          'Le délai ne peut courir qu’à partir d’une décision scellée',
        );
      }
      const notifiedAt = new Date(dto.notified_at_utc);
      if (Number.isNaN(notifiedAt.getTime())) {
        throw new BadRequestException('Date de notification invalide');
      }
      if (notifiedAt.getTime() > Date.now() + 5 * 60 * 1000) {
        throw new BadRequestException(
          'La notification ne peut pas être enregistrée dans le futur',
        );
      }

      const candidates = await manager.find(LegalDeadlineRule, {
        where: {
          tenant_id: tenantId,
          status: LegalDeadlineRuleStatus.ACTIVE,
          notificationMethod: dto.notification_method,
        },
      });
      const rule = this.selectRule(candidates, {
        jurisdictionId: Number(
          audience.jurisdiction_id ?? audience.dossier?.jurisdiction_id,
        ),
        procedureTypeId: Number(audience.dossier?.procedure_type_id),
        decisionOutcome: audience.decision_outcome ?? null,
        notifiedAt,
      });
      if (!rule) {
        throw new BadRequestException(
          'Aucune règle de délai active ne correspond à cette décision et à ce mode de notification',
        );
      }

      const dueAt = this.calculateDueAt(notifiedAt, rule);
      const idempotencyKey = this.idempotencyKey({
        tenantId,
        audienceId: audience.id,
        ruleId: rule.id,
        notifiedAt,
        method: dto.notification_method,
        reference: dto.notification_reference ?? null,
      });
      const repository = manager.getRepository(LegalDeadline);
      const existing = await repository.findOne({
        where: { tenant_id: tenantId, idempotencyKey },
      });
      if (existing) return existing;

      const deadline = await repository.save(
        repository.create({
          tenant_id: tenantId,
          audienceId: audience.id,
          dossierId: Number(audience.dossier_id),
          procedureInstanceId:
            audience.procedure_instance_id ??
            audience.dossier?.procedureInstanceId ??
            null,
          ruleId: rule.id,
          ruleFamilyKey: rule.familyKey,
          ruleVersion: rule.version,
          durationUnit: rule.durationUnit,
          durationValue: rule.durationValue,
          notificationMethod: dto.notification_method,
          notificationReference: dto.notification_reference?.trim() || null,
          notifiedAtUtc: notifiedAt,
          dueAtUtc: dueAt,
          timezone: audience.timezone || 'Africa/Ndjamena',
          status: LegalDeadlineStatus.OPEN,
          expiryEvent: rule.expiryEvent,
          idempotencyKey,
          completedAt: null,
          cancelledAt: null,
          expiredAt: null,
          closureReason: null,
        }),
      );
      await this.outboxService.enqueue(manager, {
        eventType: 'legal_deadline.expiration_due',
        aggregateType: 'LegalDeadline',
        aggregateId: deadline.id,
        idempotencyKey: `legal-deadline-expiration:${deadline.id}:${dueAt.toISOString()}`,
        nextAttemptAt: dueAt,
        payload: {
          deadlineId: deadline.id,
          dossierId: deadline.dossierId,
          procedureInstanceId: deadline.procedureInstanceId,
          expiryEvent: deadline.expiryEvent,
          dueAtUtc: dueAt.toISOString(),
        },
      });
      for (const offsetDays of rule.warningOffsets ?? []) {
        const warningAt = new Date(
          dueAt.getTime() - Number(offsetDays) * 86_400_000,
        );
        // Une alerte antérieure à la notification n'apporte aucune information
        // et provoquerait plusieurs notifications immédiates.
        if (
          warningAt < notifiedAt ||
          warningAt > dueAt ||
          warningAt.getTime() < Date.now()
        ) {
          continue;
        }
        await this.outboxService.enqueue(manager, {
          eventType: 'legal_deadline.warning_due',
          aggregateType: 'LegalDeadline',
          aggregateId: deadline.id,
          idempotencyKey:
            `legal-deadline-warning:${deadline.id}:` +
            `${offsetDays}:${warningAt.toISOString()}`,
          nextAttemptAt: warningAt,
          payload: {
            deadlineId: deadline.id,
            dossierId: deadline.dossierId,
            audienceId: deadline.audienceId,
            offsetDays: Number(offsetDays),
            dueAtUtc: dueAt.toISOString(),
          },
        });
      }
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action: 'legal_deadline.created',
        resourceType: 'LegalDeadline',
        resourceId: deadline.id,
        dossierId: deadline.dossierId,
        afterState: this.auditState(deadline),
      });
      return deadline;
    });
  }

  complete(
    id: number,
    reason: string,
    actor: ResourceActor,
  ): Promise<LegalDeadline> {
    return this.close(
      id,
      LegalDeadlineStatus.COMPLETED,
      reason,
      actor,
    );
  }

  cancel(
    id: number,
    reason: string,
    actor: ResourceActor,
  ): Promise<LegalDeadline> {
    return this.close(
      id,
      LegalDeadlineStatus.CANCELLED,
      reason,
      actor,
    );
  }

  private async close(
    id: number,
    target: LegalDeadlineStatus.COMPLETED | LegalDeadlineStatus.CANCELLED,
    reason: string,
    actor: ResourceActor,
  ): Promise<LegalDeadline> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const deadline = await manager.findOne(LegalDeadline, {
        where: { id, tenant_id: getCurrentTenantId() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deadline) throw new NotFoundException(`Délai ${id} introuvable`);
      if (deadline.status !== LegalDeadlineStatus.OPEN) {
        throw new BadRequestException(
          `Seul un délai OPEN peut être ${target.toLowerCase()}`,
        );
      }
      const before = this.auditState(deadline);
      deadline.status = target;
      deadline.closureReason = reason.trim();
      if (target === LegalDeadlineStatus.COMPLETED) {
        deadline.completedAt = new Date();
      } else {
        deadline.cancelledAt = new Date();
      }
      const saved = await manager.save(deadline);
      await this.outboxService.enqueue(manager, {
        eventType:
          target === LegalDeadlineStatus.COMPLETED
            ? 'legal_deadline.completed'
            : 'legal_deadline.cancelled',
        aggregateType: 'LegalDeadline',
        aggregateId: saved.id,
        idempotencyKey: `legal-deadline-${target.toLowerCase()}:${saved.id}`,
        payload: {
          deadlineId: saved.id,
          dossierId: saved.dossierId,
          reason: saved.closureReason,
        },
      });
      await this.auditService.append(manager, {
        actorId: actor.userId ?? actor.id,
        action: `legal_deadline.${target.toLowerCase()}`,
        resourceType: 'LegalDeadline',
        resourceId: saved.id,
        dossierId: saved.dossierId,
        beforeState: before,
        afterState: this.auditState(saved),
        justification: saved.closureReason,
      });
      return saved;
    });
  }

  private selectRule(
    rules: LegalDeadlineRule[],
    context: {
      jurisdictionId: number;
      procedureTypeId: number;
      decisionOutcome: string | null;
      notifiedAt: Date;
    },
  ): LegalDeadlineRule | null {
    const matching = rules
      .filter(
        (rule) =>
          (!rule.jurisdictionId ||
            rule.jurisdictionId === context.jurisdictionId) &&
          (!rule.procedureTypeId ||
            rule.procedureTypeId === context.procedureTypeId) &&
          (!rule.decisionOutcome ||
            rule.decisionOutcome === context.decisionOutcome) &&
          (!rule.effectiveFrom || rule.effectiveFrom <= context.notifiedAt) &&
          (!rule.effectiveTo || rule.effectiveTo >= context.notifiedAt),
      )
      .map((rule) => ({
        rule,
        specificity:
          Number(!!rule.jurisdictionId) * 4 +
          Number(!!rule.procedureTypeId) * 2 +
          Number(!!rule.decisionOutcome),
      }))
      .sort(
        (a, b) =>
          b.rule.priority - a.rule.priority ||
          b.specificity - a.specificity ||
          b.rule.version - a.rule.version ||
          a.rule.id - b.rule.id,
      );
    if (!matching.length) return null;
    const [first, second] = matching;
    if (
      second &&
      second.rule.priority === first.rule.priority &&
      second.specificity === first.specificity &&
      second.rule.familyKey !== first.rule.familyKey
    ) {
      throw new BadRequestException(
        'Plusieurs règles de délai ont la même priorité et la même spécificité',
      );
    }
    return first.rule;
  }

  private calculateDueAt(
    notifiedAt: Date,
    rule: LegalDeadlineRule,
  ): Date {
    const due = new Date(notifiedAt);
    const amount = Math.max(
      0,
      rule.durationValue - (rule.includeStartDay ? 1 : 0),
    );
    if (rule.durationUnit === LegalDeadlineDurationUnit.MONTHS) {
      due.setUTCMonth(due.getUTCMonth() + amount);
      return due;
    }
    if (rule.durationUnit === LegalDeadlineDurationUnit.CALENDAR_DAYS) {
      due.setUTCDate(due.getUTCDate() + amount);
      return due;
    }
    let remaining = amount;
    while (remaining > 0) {
      due.setUTCDate(due.getUTCDate() + 1);
      const day = due.getUTCDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
    return due;
  }

  private idempotencyKey(input: Record<string, unknown>): string {
    return `legal-deadline:${createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')}`;
  }

  private auditState(deadline: LegalDeadline): Record<string, any> {
    return {
      audienceId: deadline.audienceId,
      ruleId: deadline.ruleId,
      ruleVersion: deadline.ruleVersion,
      notifiedAtUtc: deadline.notifiedAtUtc?.toISOString?.(),
      dueAtUtc: deadline.dueAtUtc?.toISOString?.(),
      status: deadline.status,
      expiryEvent: deadline.expiryEvent,
    };
  }
}
