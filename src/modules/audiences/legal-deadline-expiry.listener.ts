import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AuditService } from 'src/core/audit/audit.service';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { InstanceStatus } from 'src/modules/procedure/entities/enums/instance-status.enum';
import { ProcedureInstanceService } from 'src/modules/procedure/services/procedure-instance.service';
import {
  LegalDeadline,
  LegalDeadlineStatus,
} from './entities/legal-deadline.entity';

interface LegalDeadlineExpirationEvent {
  eventId: string;
  tenantId: number;
  deadlineId: number;
  dossierId: number;
  procedureInstanceId?: string | null;
  expiryEvent?: string | null;
  dueAtUtc: string;
}

/**
 * Consomme l'échéance durable. L'événement métier transmis à l'instance ne
 * peut déplacer celle-ci que si son template comporte une transition
 * automatique écoutant exactement `expiryEvent`.
 */
@Injectable()
export class LegalDeadlineExpiryListener {
  constructor(
    private readonly dataSource: DataSource,
    private readonly procedureInstanceService: ProcedureInstanceService,
    private readonly auditService: AuditService,
  ) {}

  @OnEvent('outbox.legal_deadline.expiration_due')
  async expire(event: LegalDeadlineExpirationEvent): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const deadline = await manager.findOne(LegalDeadline, {
        where: {
          id: Number(event.deadlineId),
          tenant_id: Number(event.tenantId),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!deadline || deadline.status !== LegalDeadlineStatus.OPEN) return;
      if (deadline.dueAtUtc.getTime() > Date.now() + 1000) {
        throw new Error(
          `Le délai ${deadline.id} a été distribué avant son échéance`,
        );
      }

      const instanceId =
        deadline.procedureInstanceId ?? event.procedureInstanceId ?? null;
      const expiryEvent = deadline.expiryEvent ?? event.expiryEvent ?? null;
      if (instanceId && expiryEvent) {
        const instance = await manager.findOne(ProcedureInstance, {
          where: { id: instanceId, tenant_id: Number(event.tenantId) },
          select: ['id', 'status'],
        });
        if (instance?.status === InstanceStatus.ACTIVE) {
          await this.procedureInstanceService.triggerEventOnInstance(
            instance.id,
            expiryEvent,
            {
              deadlineId: deadline.id,
              dossierId: deadline.dossierId,
              dueAtUtc: deadline.dueAtUtc.toISOString(),
              ruleFamilyKey: deadline.ruleFamilyKey,
              ruleVersion: deadline.ruleVersion,
            },
            'system:legal-deadline',
          );
        }
      }

      const before = { status: deadline.status, expiredAt: null };
      deadline.status = LegalDeadlineStatus.EXPIRED;
      deadline.expiredAt = new Date();
      await manager.save(deadline);
      await this.auditService.append(manager, {
        actorId: 'system:legal-deadline',
        action: 'legal_deadline.expired',
        resourceType: 'LegalDeadline',
        resourceId: deadline.id,
        dossierId: deadline.dossierId,
        beforeState: before,
        afterState: {
          status: deadline.status,
          expiredAt: deadline.expiredAt.toISOString(),
          expiryEvent,
        },
      });
    });
  }
}
