import { InstanceStatus } from 'src/modules/procedure/entities/enums/instance-status.enum';
import { LegalDeadlineExpiryListener } from './legal-deadline-expiry.listener';
import { LegalDeadlineStatus } from './entities/legal-deadline.entity';

describe('LegalDeadlineExpiryListener', () => {
  it("ne transmet l'expiration qu'à l'instance active, puis clôt le délai", async () => {
    const deadline: any = {
      id: 61,
      tenant_id: 5,
      dossierId: 12,
      procedureInstanceId: 'instance-1',
      ruleFamilyKey: 'appeal-commercial',
      ruleVersion: 3,
      expiryEvent: 'APPEAL_DEADLINE_EXPIRED',
      dueAtUtc: new Date('2020-01-01T00:00:00.000Z'),
      status: LegalDeadlineStatus.OPEN,
      expiredAt: null,
    };
    const manager: any = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(deadline)
        .mockResolvedValueOnce({
          id: 'instance-1',
          status: InstanceStatus.ACTIVE,
        }),
      save: jest.fn(async (value) => value),
    };
    const dataSource: any = {
      transaction: jest.fn(async (_level, callback) => callback(manager)),
    };
    const procedure = {
      triggerEventOnInstance: jest.fn(async () => undefined),
    };
    const audit = { append: jest.fn(async () => ({})) };
    const listener = new LegalDeadlineExpiryListener(
      dataSource,
      procedure as any,
      audit as any,
    );

    await listener.expire({
      eventId: 'event-1',
      tenantId: 5,
      deadlineId: 61,
      dossierId: 12,
      procedureInstanceId: 'instance-1',
      expiryEvent: 'APPEAL_DEADLINE_EXPIRED',
      dueAtUtc: '2020-01-01T00:00:00.000Z',
    });

    expect(procedure.triggerEventOnInstance).toHaveBeenCalledWith(
      'instance-1',
      'APPEAL_DEADLINE_EXPIRED',
      expect.objectContaining({ deadlineId: 61 }),
      'system:legal-deadline',
    );
    expect(deadline.status).toBe(LegalDeadlineStatus.EXPIRED);
    expect(deadline.expiredAt).toBeInstanceOf(Date);
    expect(audit.append).toHaveBeenCalled();
  });

  it("n'invente aucune transition quand la règle ne porte pas d'événement", async () => {
    const deadline: any = {
      id: 62,
      tenant_id: 5,
      dossierId: 12,
      procedureInstanceId: 'instance-1',
      ruleFamilyKey: 'informational',
      ruleVersion: 1,
      expiryEvent: null,
      dueAtUtc: new Date('2020-01-01T00:00:00.000Z'),
      status: LegalDeadlineStatus.OPEN,
      expiredAt: null,
    };
    const manager: any = {
      findOne: jest.fn(async () => deadline),
      save: jest.fn(async (value) => value),
    };
    const dataSource: any = {
      transaction: jest.fn(async (_level, callback) => callback(manager)),
    };
    const procedure = {
      triggerEventOnInstance: jest.fn(async () => undefined),
    };
    const listener = new LegalDeadlineExpiryListener(
      dataSource,
      procedure as any,
      { append: jest.fn(async () => ({})) } as any,
    );

    await listener.expire({
      eventId: 'event-2',
      tenantId: 5,
      deadlineId: 62,
      dossierId: 12,
      procedureInstanceId: 'instance-1',
      expiryEvent: null,
      dueAtUtc: '2020-01-01T00:00:00.000Z',
    });

    expect(procedure.triggerEventOnInstance).not.toHaveBeenCalled();
    expect(deadline.status).toBe(LegalDeadlineStatus.EXPIRED);
  });
});
