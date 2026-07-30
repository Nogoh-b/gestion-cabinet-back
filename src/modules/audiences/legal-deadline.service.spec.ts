import { AudienceRecordStatus } from './entities/audience.entity';
import {
  LegalDeadline,
  LegalDeadlineStatus,
} from './entities/legal-deadline.entity';
import {
  LegalDeadlineDurationUnit,
  LegalDeadlineRuleStatus,
  LegalNotificationMethod,
} from './entities/legal-deadline-rule.entity';
import { LegalDeadlineService } from './legal-deadline.service';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';

describe('LegalDeadlineService', () => {
  const actor: any = { id: 8, userId: 8, tenantId: 5 };

  function harness(decisionStatus = AudienceRecordStatus.SEALED) {
    const audience: any = {
      id: 31,
      tenant_id: 5,
      dossier_id: 12,
      jurisdiction_id: 7,
      procedure_instance_id: 'instance-1',
      timezone: 'Africa/Ndjamena',
      decision_record_status: decisionStatus,
      decision_outcome: 'favorable',
      dossier: {
        id: 12,
        jurisdiction_id: 7,
        procedure_type_id: 4,
        procedureInstanceId: 'instance-1',
      },
    };
    const rule: any = {
      id: 20,
      tenant_id: 5,
      familyKey: 'appeal-commercial',
      version: 3,
      status: LegalDeadlineRuleStatus.ACTIVE,
      jurisdictionId: 7,
      procedureTypeId: 4,
      decisionOutcome: 'favorable',
      notificationMethod: LegalNotificationMethod.PERSONAL_SERVICE,
      durationValue: 10,
      durationUnit: LegalDeadlineDurationUnit.CALENDAR_DAYS,
      includeStartDay: false,
      expiryEvent: 'APPEAL_DEADLINE_EXPIRED',
      warningOffsets: [7, 3, 1, 0],
      effectiveFrom: null,
      effectiveTo: null,
      priority: 10,
    };
    const deadlineRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 61 })),
    };
    const manager: any = {
      findOne: jest.fn(async (entity) => {
        if (entity.name === 'Audience') return audience;
        return null;
      }),
      find: jest.fn(async () => [rule]),
      getRepository: jest.fn((entity) => {
        if (entity === LegalDeadline) return deadlineRepository;
        throw new Error('Dépôt inattendu');
      }),
    };
    const dataSource: any = {
      transaction: jest.fn(async (_level, callback) => callback(manager)),
    };
    const audit = { append: jest.fn(async () => ({})) };
    const outbox = { enqueue: jest.fn(async () => ({})) };
    const service = new LegalDeadlineService(
      {} as any,
      dataSource,
      audit as any,
      outbox as any,
    );
    return {
      audience,
      rule,
      manager,
      deadlineRepository,
      audit,
      outbox,
      service,
    };
  }

  it('calcule et planifie durablement le délai depuis une décision scellée', async () => {
    const ctx = harness();
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-20T12:00:00.000Z').getTime());

    try {
      const result = await runWithTenantContext(5, () =>
        ctx.service.recordNotification(
          {
            audience_id: 31,
            notified_at_utc: '2026-07-20T10:00:00.000Z',
            notification_method: LegalNotificationMethod.PERSONAL_SERVICE,
            notification_reference: 'EXP-77',
          },
          actor,
        ),
      );

      expect(result.status).toBe(LegalDeadlineStatus.OPEN);
      expect(result.dueAtUtc.toISOString()).toBe('2026-07-30T10:00:00.000Z');
      expect(result.ruleVersion).toBe(3);
      expect(ctx.outbox.enqueue).toHaveBeenCalledWith(
        ctx.manager,
        expect.objectContaining({
          eventType: 'legal_deadline.expiration_due',
          nextAttemptAt: new Date('2026-07-30T10:00:00.000Z'),
          payload: expect.objectContaining({
            procedureInstanceId: 'instance-1',
            expiryEvent: 'APPEAL_DEADLINE_EXPIRED',
          }),
        }),
      );
      expect(ctx.outbox.enqueue).toHaveBeenCalledWith(
        ctx.manager,
        expect.objectContaining({
          eventType: 'legal_deadline.warning_due',
          payload: expect.objectContaining({ offsetDays: 7 }),
        }),
      );
      expect(ctx.outbox.enqueue).toHaveBeenCalledTimes(5);
      expect(ctx.audit.append).toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('refuse de faire courir un délai depuis une décision non scellée', async () => {
    const ctx = harness(AudienceRecordStatus.VALIDATED);

    await expect(
      runWithTenantContext(5, () =>
        ctx.service.recordNotification(
          {
            audience_id: 31,
            notified_at_utc: '2026-07-20T10:00:00.000Z',
            notification_method: LegalNotificationMethod.PERSONAL_SERVICE,
          },
          actor,
        ),
      ),
    ).rejects.toThrow('décision scellée');

    expect(ctx.manager.find).not.toHaveBeenCalled();
    expect(ctx.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('échoue de manière restrictive si deux familles ont le même rang', () => {
    const ctx = harness();
    const competing = {
      ...ctx.rule,
      id: 21,
      familyKey: 'other-family',
    };

    expect(() =>
      (ctx.service as any).selectRule([ctx.rule, competing], {
        jurisdictionId: 7,
        procedureTypeId: 4,
        decisionOutcome: 'favorable',
        notifiedAt: new Date('2026-07-20T10:00:00.000Z'),
      }),
    ).toThrow('même priorité');
  });
});
