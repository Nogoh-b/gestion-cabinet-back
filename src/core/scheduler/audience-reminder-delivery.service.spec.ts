import { AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Notification } from 'src/modules/notification/entities/notification.entity';
import { UserNotification } from 'src/modules/notification/entities/user-notification.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { AudienceReminderDeliveryService } from './audience-reminder-delivery.service';

describe('AudienceReminderDeliveryService', () => {
  const event = {
    eventId: '0d4f3186-7c54-4c66-8d6d-76803346043e',
    tenantId: 9,
    idempotencyKey: 'audience-reminder:41:2026-08-01T08:00:00.000Z',
    audienceId: 41,
    dossierId: 17,
  };

  function harness(options?: {
    existingStatus?: string;
    tenantUsers?: number[];
  }) {
    const audience: any = {
      id: 41,
      tenant_id: 9,
      dossier_id: 17,
      starts_at_utc: new Date('2026-08-01T08:00:00.000Z'),
      timezone: 'Africa/Ndjamena',
      audience_date: '2026-08-01',
      audience_time: '09:00:00',
      room: 'A',
      status: AudienceStatus.SCHEDULED,
      reminder_sent: false,
      reminder_sent_at: null,
      dossier: {
        id: 17,
        dossier_number: 'DOS-2026-0017',
        lawyer_id: 101,
        collaborators: [{ id: 102 }, { id: 101 }],
      },
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce(
        options?.existingStatus
          ? [{ status: options.existingStatus }]
          : [],
      )
      .mockResolvedValue([]);
    const notificationRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 501 })),
    };
    const userNotificationRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const userRepository = {
      find: jest.fn(async () =>
        (options?.tenantUsers ?? [101, 102]).map((id) => ({ id })),
      ),
    };
    const manager: any = {
      query,
      findOne: jest.fn(async () => audience),
      getRepository: jest.fn((entity) => {
        if (entity === Notification) return notificationRepository;
        if (entity === UserNotification) return userNotificationRepository;
        if (entity === User) return userRepository;
        throw new Error('Dépôt inattendu');
      }),
      save: jest.fn(async (value) => value),
    };
    const dataSource: any = {
      transaction: jest.fn(async (_level, callback) => callback(manager)),
    };
    return {
      audience,
      manager,
      query,
      notificationRepository,
      userNotificationRepository,
      userRepository,
      service: new AudienceReminderDeliveryService(dataSource),
    };
  }

  it('crée le journal et acquitte le rappel dans la même transaction', async () => {
    const ctx = harness();

    await ctx.service.deliver(event);

    expect(ctx.manager.findOne).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        where: { id: 41, tenant_id: 9 },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(ctx.userRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: 9 }),
      }),
    );
    expect(ctx.notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 9,
        user_id: null,
      }),
    );
    expect(ctx.userNotificationRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tenant_id: 9, user_id: 101 }),
        expect.objectContaining({ tenant_id: 9, user_id: 102 }),
      ]),
    );
    expect(ctx.audience.reminder_sent).toBe(true);
    expect(ctx.audience.reminder_sent_at).toBeInstanceOf(Date);
    expect(ctx.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'DELIVERED'"),
      [501, event.eventId, 9],
    );
  });

  it('ne rejoue pas un rappel déjà livré', async () => {
    const ctx = harness({ existingStatus: 'DELIVERED' });

    await ctx.service.deliver(event);

    expect(ctx.manager.findOne).not.toHaveBeenCalled();
    expect(ctx.notificationRepository.save).not.toHaveBeenCalled();
  });

  it("refuse d'acquitter si un destinataire n'appartient pas au cabinet", async () => {
    const ctx = harness({ tenantUsers: [101] });

    await expect(ctx.service.deliver(event)).rejects.toThrow(
      'destinataire absent ou étranger au cabinet',
    );

    expect(ctx.audience.reminder_sent).toBe(false);
    expect(ctx.notificationRepository.save).not.toHaveBeenCalled();
    expect(ctx.query).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'DELIVERED'"),
      expect.anything(),
    );
  });
});
