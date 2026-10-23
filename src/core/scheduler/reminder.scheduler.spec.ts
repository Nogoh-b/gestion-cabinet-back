import { ReminderScheduler } from './reminder.scheduler';
import { DiligenceStatus } from 'src/modules/diligence/entities/diligence.entity';

/** Journal d'envois en mémoire qui imite INSERT IGNORE + clé unique. */
function fakeDb() {
  const keys = new Set<string>();
  return {
    keys,
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.startsWith('INSERT IGNORE')) {
        const key = params.join('|');
        if (keys.has(key)) return { affectedRows: 0 };
        keys.add(key);
        return { affectedRows: 1 };
      }
      return { affectedRows: 0 };
    }),
  };
}

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diligence(id: number, deadlineOffset: number, extra: any = {}) {
  return {
    id,
    title: `Diligence ${id}`,
    deadline: day(deadlineOffset),
    dossier_id: 100 + id,
    assigned_lawyer_id: 7,
    status: DiligenceStatus.IN_PROGRESS,
    dossier: { id: 100 + id, lawyer_id: 7, status: '3' },
    ...extra,
  };
}

function setup(diligences: any[]) {
  const db = fakeDb();
  const notifications = { createBulk: jest.fn().mockResolvedValue(undefined) };
  const scheduler = new ReminderScheduler(
    { find: jest.fn().mockResolvedValue([{ id: 25 }]) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    { find: jest.fn().mockResolvedValue(diligences) } as any,
    { find: jest.fn().mockResolvedValue([]) } as any,
    notifications as any,
    { run: (_id: number, fn: () => any) => fn() } as any,
    db as any,
  );
  return { scheduler, notifications, db };
}

const titles = (notifications: any) =>
  notifications.createBulk.mock.calls.map((call: any[]) => call[0].title);

describe('ReminderScheduler — diligences', () => {
  it('sends one daily digest for old overdue diligences instead of one alert each', async () => {
    const { scheduler, notifications } = setup([
      diligence(1, -30),
      diligence(2, -12),
      diligence(3, -400),
    ]);
    await scheduler.runDeadlineAlerts();
    expect(titles(notifications)).toEqual(['3 diligences en retard']);
    expect(notifications.createBulk.mock.calls[0][0].data.count).toBe(3);
  });

  it('alerts a newly overdue diligence once, then only through the digest', async () => {
    const { scheduler, notifications } = setup([diligence(1, -1)]);
    await scheduler.runDeadlineAlerts();
    expect(titles(notifications)).toEqual(['Diligence en retard']);
    expect(notifications.createBulk.mock.calls[0][0].data.diligenceId).toBe(1);

    // Même jour, second passage (redémarrage, autre instance) : rien.
    notifications.createBulk.mockClear();
    await scheduler.runDeadlineAlerts();
    expect(notifications.createBulk).not.toHaveBeenCalled();
  });

  it('never repeats the digest or due-soon alerts on the same day', async () => {
    const { scheduler, notifications } = setup([
      diligence(1, -20),
      diligence(2, 3),
    ]);
    await scheduler.runDeadlineAlerts();
    expect(titles(notifications).sort()).toEqual([
      'Diligence en retard',
      'Échéance de diligence',
    ]);
    notifications.createBulk.mockClear();
    await scheduler.runDeadlineAlerts();
    await scheduler.runDeadlineAlerts();
    expect(notifications.createBulk).not.toHaveBeenCalled();
  });

  it('ignores closed dossiers, deleted dossiers and finished diligences', async () => {
    const { scheduler, notifications } = setup([
      diligence(1, -5, { dossier: { id: 1, lawyer_id: 7, status: '8' } }),
      diligence(2, -5, { dossier: { id: 2, lawyer_id: 7, status: '9' } }),
      diligence(3, -5, { dossier: null }),
      diligence(4, -5, { status: DiligenceStatus.CANCELLED }),
      diligence(5, 2),
    ]);
    await scheduler.runDeadlineAlerts();
    expect(notifications.createBulk).not.toHaveBeenCalled();
  });

  it('groups the digest per recipient', async () => {
    const { scheduler, notifications } = setup([
      diligence(1, -10),
      diligence(2, -10, { assigned_lawyer_id: 9 }),
      diligence(3, -11, { assigned_lawyer_id: 9 }),
    ]);
    await scheduler.runDeadlineAlerts();
    const byUser = Object.fromEntries(
      notifications.createBulk.mock.calls.map((call: any[]) => [
        call[0].user_ids[0],
        call[0].data.count,
      ]),
    );
    expect(byUser).toEqual({ 7: 1, 9: 2 });
  });
});
