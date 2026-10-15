/** Emails de facturation : relances J-N dédoublonnées, événements ciblés. */
import { describe, expect, it, jest } from '@jest/globals';
import { BillingNotifierService } from './billing-notifier.service';

function build(opts: { dueInDays: number; alreadySent?: boolean; days?: number[] }) {
  const due = new Date();
  due.setHours(12, 0, 0, 0);
  due.setDate(due.getDate() + opts.dueInDays);
  const db: any = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM platform_settings')) {
        if (sql && (db.query.mock.calls.at(-1)?.[1] ?? [])[0] === 'reminders') {
          return [{ value: JSON.stringify({ enabled: true, days_before: opts.days ?? [7, 3, 1] }) }];
        }
        return [];
      }
      if (sql.includes('FROM subscriptions s')) {
        return [{ id: 9, cabinet_id: 4, is_trial: 1, trial_ends_at: due, ends_at: due, plan_name: 'Cabinet', due_at: due }];
      }
      if (sql.includes('FROM cabinets WHERE id')) {
        return [{ id: 4, name: 'Cabinet Test', code: 'abcd1234', contact_email: 'contact@cabinet.test' }];
      }
      if (sql.includes('FROM `user`')) return [{ email: 'admin@cabinet.test' }];
      return [];
    }),
  };
  const mail: any = { sendDirect: jest.fn(async () => undefined) };
  const events: any = {
    exists: jest.fn(async () => !!opts.alreadySent),
    record: jest.fn(async () => undefined),
  };
  const service = new BillingNotifierService(db, mail, {} as any, events);
  return { service, mail, events };
}

describe('BillingNotifierService — relances', () => {
  it("envoie la relance J-3 d'un essai et la trace", async () => {
    const { service, mail, events } = build({ dueInDays: 3 });
    await service.sendExpiryReminders();
    expect(mail.sendDirect).toHaveBeenCalledTimes(1);
    const sent = (mail.sendDirect.mock.calls[0] as any)[0];
    expect(sent.to).toEqual(['contact@cabinet.test', 'admin@cabinet.test']);
    expect(sent.subject).toContain('3 jours');
    expect(sent.transport).toBe('platform');
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reminder_sent', cabinetId: 4 }),
    );
  });

  it('ne renvoie pas une relance déjà envoyée', async () => {
    const { service, mail } = build({ dueInDays: 3, alreadySent: true });
    await service.sendExpiryReminders();
    expect(mail.sendDirect).not.toHaveBeenCalled();
  });

  it("n'envoie rien hors des jours configurés", async () => {
    const { service, mail } = build({ dueInDays: 5 });
    await service.sendExpiryReminders();
    expect(mail.sendDirect).not.toHaveBeenCalled();
  });
});

describe('BillingNotifierService — événements', () => {
  it('prévient le cabinet d’un paiement refusé', async () => {
    const { service, mail } = build({ dueInDays: 30 });
    await service.onSubscriptionEvent({
      id: 1,
      cabinet_id: 4,
      subscription_id: 9,
      type: 'payment_failed',
      actor_type: 'system',
      actor_id: null,
      actor_label: null,
      payload: { reason: 'Solde insuffisant' },
      created_at: new Date(),
    });
    const sent = (mail.sendDirect.mock.calls[0] as any)[0];
    expect(sent.subject).toContain('n’a pas abouti');
    expect(sent.html).toContain('Solde insuffisant');
    expect(sent.html).toContain('/t/abcd1234/abonnement');
  });

  it("n'écrit pas au cabinet pour un changement de plan qu'il a fait lui-même", async () => {
    const { service, mail } = build({ dueInDays: 30 });
    await service.onSubscriptionEvent({
      id: 2,
      cabinet_id: 4,
      subscription_id: 9,
      type: 'plan_changed',
      actor_type: 'cabinet_user',
      actor_id: 3,
      actor_label: 'x',
      payload: {},
      created_at: new Date(),
    });
    expect(mail.sendDirect).not.toHaveBeenCalled();
  });
});
