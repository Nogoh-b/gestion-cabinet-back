import { NotifiableEvent } from './notification-events.enum';
import { NotificationDispatcher } from './notification-dispatcher.service';

describe('NotificationDispatcher - mode durable', () => {
  const queryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };
  const assignmentRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  let dispatcher: NotificationDispatcher;

  const payload = {
    event: NotifiableEvent.FACTURE_CREATED,
    title: 'Facture émise',
    content: 'Une facture a été émise',
    audience: {},
    entity: { type: 'facture', id: 'invoice-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    assignmentRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    queryBuilder.getRawMany.mockRejectedValue(
      new Error('base notifications indisponible'),
    );
    dispatcher = new NotificationDispatcher(
      {} as any,
      assignmentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('propage l’échec en mode strict pour que l’outbox réessaie', async () => {
    await expect(dispatcher.dispatchStrict(payload as any)).rejects.toThrow(
      'base notifications indisponible',
    );
  });

  it('conserve le mode non bloquant pour les anciens subscribers', async () => {
    await expect(dispatcher.dispatch(payload as any)).resolves.toBeUndefined();
  });
});
