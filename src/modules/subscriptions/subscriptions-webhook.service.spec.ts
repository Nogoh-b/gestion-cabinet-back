import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService webhook security', () => {
  const buildService = (manager: any) => {
    const dataSource = {
      transaction: jest.fn(async (isolation: string, action: any) =>
        action(manager),
      ),
    };
    const gateway = { providerName: 'test-gateway' };
    const service = new SubscriptionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      gateway as any,
      dataSource as any,
    );
    return { service, dataSource };
  };

  const lockedRepository = (entity: any, save = jest.fn()) => {
    const builder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(entity),
    };
    return {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      save,
      builder,
    };
  };

  it('ignore atomiquement un identifiant d’événement déjà enregistré', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue({ affectedRows: 0 }),
      getRepository: jest.fn(),
    };
    const { service, dataSource } = buildService(manager);

    await service.handleWebhook('ref-1', 'evt-1', 'paid');

    expect(dataSource.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    );
    expect(manager.getRepository).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('confirme paiement, abonnement et cabinet dans la même transaction verrouillée', async () => {
    const payment: any = {
      id: 10,
      reference: 'ref-1',
      subscription_id: 20,
      status: 'pending',
      method: null,
    };
    const subscription: any = {
      id: 20,
      cabinet_id: 30,
      status: 'pending_payment',
      is_trial: false,
      ends_at: new Date('2026-12-31'),
      plan_id: 4,
    };
    const cabinet: any = {
      id: 30,
      status: 'suspended',
      plan_id: 1,
    };
    const paymentRepository = lockedRepository(payment);
    const subscriptionRepository = lockedRepository(subscription);
    const cabinetRepository = lockedRepository(cabinet);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
      getRepository: jest.fn((entity: any) => {
        if (entity.name === 'SubscriptionPayment') return paymentRepository;
        if (entity.name === 'Subscription') return subscriptionRepository;
        if (entity.name === 'Cabinet') return cabinetRepository;
        throw new Error(`Repository inattendu: ${entity.name}`);
      }),
    };
    const { service } = buildService(manager);

    await service.handleWebhook('ref-1', 'evt-1', 'paid');

    expect(payment.status).toBe('paid');
    expect(payment.method).toBe('test-gateway');
    expect(payment.last_webhook_event_id).toBe('evt-1');
    expect(subscription.status).toBe('active');
    expect(cabinet.status).toBe('active');
    expect(cabinet.plan_id).toBe(4);
    expect(paymentRepository.builder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(subscriptionRepository.builder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(cabinetRepository.builder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('processed_at'),
      [10, 'evt-1'],
    );
  });

  it('ne rétrograde jamais un paiement déjà confirmé sur un événement tardif', async () => {
    const payment: any = {
      id: 10,
      reference: 'ref-1',
      subscription_id: 20,
      status: 'paid',
      method: 'card',
    };
    const paymentRepository = lockedRepository(payment);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
      getRepository: jest.fn(() => paymentRepository),
    };
    const { service } = buildService(manager);

    await service.handleWebhook('ref-1', 'evt-late', 'failed');

    expect(payment.status).toBe('paid');
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);
  });
});
