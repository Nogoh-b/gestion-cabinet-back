import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { CaseWorkflowNotificationsService } from './case-workflow-notifications.service';

/**
 * Règle métier vérifiée ici : seul le responsable de l'action est prévenu, et
 * jamais l'auteur du geste (aucun admin ajouté d'office) — cf. Option A :
 * l'assignation et la complétion restent portées par la diligence liée.
 */
describe('CaseWorkflowNotificationsService', () => {
  const notifications = { createBulk: jest.fn(async () => []) };
  const service = new CaseWorkflowNotificationsService(notifications as any);

  const action = {
    id: 'action-1',
    dossier_id: 42,
    title: 'Préparer les conclusions',
    responsible_user_id: 15,
    status: 'in_progress',
    due_at: new Date('2026-09-20T16:00:00.000Z'),
  } as any;

  beforeEach(() => {
    notifications.createBulk.mockClear();
  });

  it('prévient le responsable (et lui seul) au démarrage', async () => {
    await service.actionStarted(action, 12);

    expect(notifications.createBulk).toHaveBeenCalledTimes(1);
    expect(notifications.createBulk).toHaveBeenCalledWith(
      expect.objectContaining({
        user_ids: [15],
        type: NotificationType.DOSSIER_ACTION_STARTED,
        link: '/dossiers/42?tab=steps#action-action-1',
      }),
      1,
    );
  });

  it("ne notifie personne quand l'auteur est le responsable de l'action", async () => {
    await service.actionStarted(action, 15);
    await service.actionHeld(action, 15, 'en attente du client');
    await service.actionCancelled(action, 15, 'doublon');
    await service.actionDeadlineExtended(action, 15, null);

    expect(notifications.createBulk).not.toHaveBeenCalled();
  });

  it("ne notifie personne quand l'action n'a pas de responsable", async () => {
    await service.actionCancelled(
      { ...action, responsible_user_id: null },
      12,
      'doublon',
    );

    expect(notifications.createBulk).not.toHaveBeenCalled();
  });

  it("joint le motif à l'annulation et la marque en priorité haute", async () => {
    await service.actionCancelled(action, 12, 'Dossier clos');

    expect(notifications.createBulk).toHaveBeenCalledWith(
      expect.objectContaining({
        user_ids: [15],
        type: NotificationType.DOSSIER_ACTION_CANCELLED,
        content: expect.stringContaining('Dossier clos'),
        priority: 'HIGH',
      }),
      1,
    );
  });

  it("rappelle l'ancienne et la nouvelle échéance au report", async () => {
    await service.actionDeadlineExtended(
      action,
      12,
      new Date('2026-09-18T16:00:00.000Z'),
    );

    const [payload] = notifications.createBulk.mock.calls[0] as any[];
    expect(payload.type).toBe(
      NotificationType.DOSSIER_ACTION_DEADLINE_EXTENDED,
    );
    expect(payload.content).toContain('18 septembre 2026');
    expect(payload.content).toContain('20 septembre 2026');
  });
});
