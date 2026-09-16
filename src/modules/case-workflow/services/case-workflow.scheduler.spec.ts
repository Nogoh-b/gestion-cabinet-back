import { describe, expect, it, jest } from '@jest/globals';

import { DossierActionStatus } from '../case-workflow.enums';
import { CaseWorkflowScheduler } from './case-workflow.scheduler';

describe('CaseWorkflowScheduler', () => {
  it('signale une action en retard même si le rappel préalable a déjà été envoyé', async () => {
    const dueAt = new Date(Date.now() - 2 * 86_400_000);
    const actionRepository = {
      find: jest.fn(async () => [
        {
          id: 'action-1',
          title: 'Saisir une juridiction',
          status: DossierActionStatus.IN_PROGRESS,
          responsible_user_id: 32,
          due_at: dueAt,
          remind_at: new Date(dueAt.getTime() - 86_400_000),
          reminder_sent_at: new Date(dueAt.getTime() - 86_400_000),
        },
      ]),
      query: jest.fn(),
      manager: {},
    };
    const eventRepository = {
      findOne: jest.fn(async () => null),
    };
    const eventService = { append: jest.fn(async () => undefined) };
    const notifications = { createBulk: jest.fn(async () => undefined) };
    const scheduler = new CaseWorkflowScheduler(
      {} as never,
      {} as never,
      actionRepository as never,
      eventRepository as never,
      {} as never,
      {} as never,
      eventService as never,
      {} as never,
      notifications as never,
      {} as never,
      {} as never,
    );

    const hasOverdueAction = await (scheduler as any).sendDueActionReminders(
      {
        id: 7,
        dossier_number: 'DOS-2026-0042',
        lawyer: null,
        collaborators: [],
      },
      3,
    );

    expect(hasOverdueAction).toBe(true);
    expect(notifications.createBulk).toHaveBeenCalledWith(
      expect.objectContaining({
        user_ids: [32],
        title: 'Action en retard — Saisir une juridiction',
        priority: 'URGENT',
      }),
      1,
    );
    expect(eventService.append).toHaveBeenCalledWith(
      actionRepository.manager,
      expect.objectContaining({
        eventType: 'DOSSIER_ACTION_OVERDUE_NOTIFIED',
      }),
    );
    expect(actionRepository.query).not.toHaveBeenCalled();
  });
});
