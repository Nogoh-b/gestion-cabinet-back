/**
 * Notifications vers le portail client : le client est retrouvé par sa fiche
 * (compte `users.customer_id`), reçoit sa propre notification avec un lien
 * vers l'espace client (jamais le lien du back-office), et un client sans
 * compte ne reçoit qu'un e-mail sans lien.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotifiableEvent } from './notification-events.enum';

describe('NotificationDispatcher — espace client', () => {
  let userRepo: any;
  let notificationService: any;
  let mailService: any;
  let dispatcher: NotificationDispatcher;

  beforeEach(() => {
    process.env.APP_FRONTEND_URL = 'https://app.test/';
    userRepo = {
      findOne: jest.fn(async () => ({ id: 50, email: 'client@test.fr' })),
      find: jest.fn(async ({ where }: any) =>
        where.map((w: any) => ({ id: w.id, email: `user${w.id}@cabinet.fr` })),
      ),
    };
    notificationService = { createBulk: jest.fn(async () => []) };
    mailService = { sendDirect: jest.fn(async () => undefined) };
    dispatcher = new NotificationDispatcher(
      userRepo,
      {} as any,
      { find: jest.fn(async () => []) } as any,
      notificationService,
      mailService,
      {
        renderOrCreateSystemDefault: jest.fn(async () => {
          throw new Error('Template introuvable');
        }),
      } as any,
    );
  });

  const payment = (client: Record<string, any>) => ({
    event: NotifiableEvent.PAIEMENT_RECEIVED,
    title: 'Paiement reçu',
    content: '100 000 XAF',
    link: '/facturation/factures/f-1',
    audience: {
      client: { notify: true, ...client },
      lawyer_id: 48,
      admin_ids_override: [],
    },
    entity: { type: 'paiement', id: 'p-1' },
  });

  it('retrouve le compte du client et lui envoie sa propre notification', async () => {
    await dispatcher.dispatch(
      payment({ customer_id: 83, email: 'client@test.fr' }) as any,
    );

    const calls = notificationService.createBulk.mock.calls as any[];
    expect(calls).toHaveLength(2);
    // Cabinet : lien du back-office.
    expect(calls[0][0]).toMatchObject({
      user_ids: [48],
      link: '/facturation/factures/f-1',
    });
    // Client : lien de l'espace client (déduit de l'entité).
    expect(calls[1][0]).toMatchObject({
      user_ids: [50],
      link: '/espace-client/factures',
    });
  });

  it("préfère le lien client explicite et l'écrit en absolu dans l'e-mail", async () => {
    await dispatcher.dispatch({
      ...payment({ customer_id: 83, email: 'client@test.fr' }),
      clientLink: '/espace-client/factures/f-1',
    } as any);

    expect((notificationService.createBulk.mock.calls[1][0] as any).link).toBe(
      '/espace-client/factures/f-1',
    );
    const clientMail = (mailService.sendDirect.mock.calls as any[]).find(
      ([m]) => m.to === 'client@test.fr',
    )?.[0];
    expect(clientMail.html).toContain('https://app.test/espace-client/factures/f-1');
    expect(clientMail.html).not.toContain('/facturation/');
  });

  it("client sans compte : e-mail seul, sans lien vers un espace qu'il ne peut pas ouvrir", async () => {
    userRepo.findOne.mockResolvedValue(null);

    await dispatcher.dispatch(
      payment({ customer_id: 83, email: 'client@test.fr' }) as any,
    );

    const calls = notificationService.createBulk.mock.calls as any[];
    expect(calls).toHaveLength(1);
    expect(calls[0][0].user_ids).toEqual([48]);
    const clientMail = (mailService.sendDirect.mock.calls as any[]).find(
      ([m]) => m.to === 'client@test.fr',
    )?.[0];
    expect(clientMail).toBeDefined();
    expect(clientMail.html).not.toContain('href');
  });

  it('client non notifié : aucune recherche de compte', async () => {
    await dispatcher.dispatch(
      payment({ customer_id: 83, email: 'client@test.fr', notify: false }) as any,
    );
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(notificationService.createBulk).toHaveBeenCalledTimes(1);
  });
});
