import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MailService } from 'src/core/shared/emails/emails.service';
import {
  renderSimpleMail,
  renderSimpleText,
  SimpleMailInput,
} from 'src/core/shared/emails/simple-mail-template';
import { SubscriptionEvent } from '../entities/subscription-event.entity';
import {
  SUBSCRIPTION_EVENT,
  SubscriptionEventsService,
} from '../subscription-events.service';
import { frontendPublicUrl } from '../payment/payment-methods.service';
import { readBillingSetting } from './billing-settings';
import { formatAmount, ReceiptService } from './receipt.service';

const CYCLES: Record<string, string> = { monthly: 'mensuel', yearly: 'annuel' };

function frDate(value: any): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

interface CabinetInfo {
  id: number;
  name: string;
  code: string;
  recipients: string[];
}

/**
 * Emails de facturation envoyés aux cabinets (et au support plateforme) à
 * partir des événements d'abonnement, plus les relances avant échéance.
 * Asynchrone et tolérant : un échec d'envoi n'interrompt jamais l'action.
 */
@Injectable()
export class BillingNotifierService {
  private readonly logger = new Logger(BillingNotifierService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly mail: MailService,
    private readonly receipts: ReceiptService,
    private readonly events: SubscriptionEventsService,
  ) {}

  @OnEvent(SUBSCRIPTION_EVENT, { async: true })
  async onSubscriptionEvent(event: SubscriptionEvent): Promise<void> {
    try {
      await this.dispatch(event);
    } catch (error) {
      this.logger.warn(
        `Notification « ${event.type} » (cabinet ${event.cabinet_id}) non envoyée : ${(error as Error).message}`,
      );
    }
  }

  private async dispatch(e: SubscriptionEvent) {
    const p = e.payload ?? {};
    const fromPlatform = e.actor_type === 'platform_admin';
    switch (e.type) {
      case 'payment_paid':
        return this.paymentReceived(e.cabinet_id, Number(p.payment_id));
      case 'payment_failed':
        return this.toCabinet(e.cabinet_id, {
          subject: 'Votre paiement n’a pas abouti',
          title: 'Paiement non abouti',
          paragraphs: [
            'Le paiement de votre abonnement n’a pas pu être confirmé.',
            p.reason ? `Motif : ${p.reason}` : 'Vous pouvez réessayer avec le même moyen ou en choisir un autre.',
          ],
          withAction: 'Régler mon abonnement',
        });
      case 'payment_rejected':
        return this.toCabinet(e.cabinet_id, {
          subject: 'Déclaration de paiement non validée',
          title: 'Votre déclaration de paiement n’a pas été validée',
          paragraphs: [
            `Motif : ${p.reason ?? 'non précisé'}.`,
            'Vérifiez la référence du paiement ou contactez notre équipe, puis déclarez-le à nouveau.',
          ],
          withAction: 'Voir mon abonnement',
        });
      case 'payment_refunded':
        return this.toCabinet(e.cabinet_id, {
          subject: 'Remboursement effectué',
          title: 'Remboursement effectué',
          paragraphs: [`Un remboursement de ${formatAmount(Number(p.amount), 'XAF')} a été enregistré.`, p.reason ? `Motif : ${p.reason}` : ''].filter(Boolean),
        });
      case 'payment_declared':
        return this.toSupport(e, p);
      case 'suspended':
        return this.toCabinet(e.cabinet_id, {
          subject: 'Accès à votre espace suspendu',
          title: 'Accès suspendu',
          paragraphs: [
            'L’accès à votre espace a été suspendu par notre équipe.',
            p.note ? `Motif : ${p.note}` : '',
            'Contactez le support pour toute question.',
          ].filter(Boolean),
        });
      case 'expired':
        return this.toCabinet(e.cabinet_id, {
          subject: 'Votre abonnement a expiré',
          title: 'Abonnement arrivé à échéance',
          paragraphs: [
            'Votre abonnement est arrivé à échéance : l’accès à votre espace est suspendu.',
            'Renouvelez-le pour retrouver immédiatement l’accès à vos données.',
          ],
          withAction: 'Renouveler mon abonnement',
        });
      case 'reactivated':
        if (p.still_suspended_reason) return;
        return this.toCabinet(e.cabinet_id, {
          subject: 'Accès rétabli',
          title: 'Votre accès est rétabli',
          paragraphs: ['Votre espace est de nouveau accessible. Merci de votre confiance.'],
        });
      case 'cancelled':
        if (!fromPlatform) return;
        return this.toCabinet(e.cabinet_id, {
          subject: 'Résiliation de votre abonnement',
          title: 'Abonnement résilié',
          paragraphs: [
            p.immediate
              ? 'Votre abonnement a été résilié avec effet immédiat.'
              : `Votre abonnement ne sera pas reconduit ; l’accès reste ouvert jusqu’au ${frDate(p.ends_at)}.`,
            p.reason ? `Motif : ${p.reason}` : '',
          ].filter(Boolean),
        });
      case 'extended':
      case 'free_period_granted':
        if (!fromPlatform) return;
        return this.toCabinet(e.cabinet_id, {
          subject: e.type === 'extended' ? 'Votre abonnement a été prolongé' : 'Période offerte sur votre abonnement',
          title: e.type === 'extended' ? 'Abonnement prolongé' : 'Période offerte',
          paragraphs: [
            `Nouvelle échéance : ${frDate(p.after?.trial_ends_at && p.after?.status === 'trial' ? p.after.trial_ends_at : p.after?.ends_at)}.`,
          ],
        });
      case 'plan_changed':
        if (!fromPlatform) return;
        return this.planChanged(e.cabinet_id, p);
      default:
        return;
    }
  }

  // ── Paiement reçu (+ reçu PDF) ──────────────────────────────────────────────

  private async paymentReceived(cabinetId: number, paymentId: number) {
    const [p] = await this.db.query(
      `SELECT sp.amount, sp.currency, sp.period_start, sp.period_end, sp.paid_at, sp.receipt_number,
              sp.method, pm.label AS method_label, pl.name AS plan_name, s.billing_cycle
         FROM subscription_payments sp
         LEFT JOIN subscriptions s ON s.id = sp.subscription_id
         LEFT JOIN plans pl ON pl.id = s.plan_id
         LEFT JOIN platform_payment_methods pm ON pm.id = sp.payment_method_id
        WHERE sp.id = ?`,
      [paymentId],
    );
    if (!p) return;
    let attachment: { filename: string; content: Buffer; contentType: string } | null = null;
    try {
      const pdf = await this.receipts.pdf(paymentId);
      attachment = { filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' };
    } catch (error) {
      this.logger.warn(`Reçu #${paymentId} non généré : ${(error as Error).message}`);
    }
    await this.toCabinet(cabinetId, {
      subject: `Paiement reçu${p.receipt_number ? ` — reçu ${p.receipt_number}` : ''}`,
      title: 'Merci, votre paiement est confirmé',
      paragraphs: ['Votre abonnement est actif. Votre reçu est joint à cet email.'],
      details: [
        ['Montant', formatAmount(Number(p.amount), p.currency || 'XAF')],
        ['Abonnement', `${p.plan_name ?? '—'}${p.billing_cycle ? ` (${CYCLES[p.billing_cycle] ?? p.billing_cycle})` : ''}`],
        ['Période', `${frDate(p.period_start)} au ${frDate(p.period_end)}`],
        ['Moyen', p.method_label ?? p.method ?? '—'],
        ['Reçu', p.receipt_number ?? '—'],
      ],
      withAction: 'Voir mon abonnement',
      attachments: attachment ? [attachment] : undefined,
    });
  }

  private async planChanged(cabinetId: number, p: any) {
    const [plan] = await this.db.query('SELECT name FROM plans WHERE id = ?', [p.plan_id ?? p.after?.plan_id]);
    await this.toCabinet(cabinetId, {
      subject: 'Votre abonnement a été modifié',
      title: 'Changement de plan',
      paragraphs: [
        `Votre abonnement passe au plan ${plan?.name ?? 'sélectionné'}.`,
        p.mode === 'keep_period'
          ? 'La période en cours est conservée ; le nouveau tarif s’appliquera au prochain renouvellement.'
          : 'Une nouvelle période a été ouverte : réglez l’échéance pour l’activer.',
      ],
      withAction: 'Voir mon abonnement',
    });
  }

  private async toSupport(e: SubscriptionEvent, p: any) {
    const support = await readBillingSetting(this.db, 'support');
    if (!support.email) return;
    const cabinet = await this.cabinet(e.cabinet_id);
    await this.send(support.email, {
      subject: `Paiement à valider — ${cabinet?.name ?? `cabinet ${e.cabinet_id}`}`,
      title: 'Nouveau paiement déclaré',
      paragraphs: ['Un cabinet a déclaré un paiement manuel : vérifiez-le puis validez-le dans la console.'],
      details: [
        ['Cabinet', cabinet?.name ?? String(e.cabinet_id)],
        ['Montant', formatAmount(Number(p.amount), 'XAF')],
        ['Moyen', p.method ?? '—'],
        ['Référence', p.reference ?? '—'],
        ['Justificatif', p.has_proof ? 'oui' : 'non'],
      ],
      action: { label: 'Ouvrir les paiements à valider', url: `${frontendPublicUrl()}/platform/paiements` },
    });
  }

  // ── Relances avant échéance ─────────────────────────────────────────────────

  /** Tous les jours à 8 h : relances J-N (fin d'essai ou fin de période). */
  @Cron('0 8 * * *')
  async sendExpiryReminders(): Promise<void> {
    const settings = await readBillingSetting(this.db, 'reminders');
    if (!settings.enabled || !settings.days_before?.length) return;
    const subs: Array<any> = await this.db.query(
      `SELECT s.id, s.cabinet_id, s.is_trial, s.trial_ends_at, s.ends_at, s.auto_renew, p.name AS plan_name,
              CASE WHEN s.is_trial = 1 AND s.trial_ends_at IS NOT NULL THEN s.trial_ends_at ELSE s.ends_at END AS due_at
         FROM subscriptions s
         JOIN cabinets c ON c.id = s.cabinet_id
         LEFT JOIN plans p ON p.id = s.plan_id
        WHERE s.status IN ('trial','active')
          AND s.id IN (SELECT MAX(id) FROM subscriptions WHERE status <> 'cancelled' GROUP BY cabinet_id)
          AND NOT (c.status = 'suspended' AND c.suspension_reason = 'manual')
          AND (CASE WHEN s.is_trial = 1 AND s.trial_ends_at IS NOT NULL THEN s.trial_ends_at ELSE s.ends_at END)
              BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)`,
      [Math.max(...settings.days_before) + 1],
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const sub of subs) {
      const due = new Date(sub.due_at);
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
      if (!settings.days_before.includes(days)) continue;
      const key = `${sub.id}:${dueDay.toISOString().slice(0, 10)}:${days}`;
      if (await this.events.exists(sub.cabinet_id, 'reminder_sent', key)) continue;
      const trial = !!Number(sub.is_trial);
      const sent = await this.toCabinet(sub.cabinet_id, {
        subject: trial
          ? `Votre période d’essai se termine dans ${days} jour${days > 1 ? 's' : ''}`
          : `Votre abonnement arrive à échéance dans ${days} jour${days > 1 ? 's' : ''}`,
        title: trial ? 'Fin de votre période d’essai' : 'Échéance de votre abonnement',
        paragraphs: [
          trial
            ? `Votre essai du plan ${sub.plan_name ?? ''} se termine le ${frDate(due)}.`
            : `Votre abonnement ${sub.plan_name ?? ''} arrive à échéance le ${frDate(due)}.`,
          'Pensez à régler votre abonnement pour éviter toute interruption d’accès.',
        ],
        withAction: 'Gérer mon abonnement',
      });
      if (sent) {
        await this.events.record({
          cabinetId: sub.cabinet_id,
          subscriptionId: sub.id,
          type: 'reminder_sent',
          payload: { key, days, due_at: due, trial },
        });
      }
    }
  }

  // ── Envoi ───────────────────────────────────────────────────────────────────

  private async cabinet(cabinetId: number): Promise<CabinetInfo | null> {
    const [c] = await this.db.query('SELECT id, name, code, contact_email FROM cabinets WHERE id = ?', [cabinetId]);
    if (!c) return null;
    const admins: Array<{ email: string }> = await this.db.query(
      `SELECT email FROM \`user\` WHERE tenant_id = ? AND role = 'admin' AND status = 1 AND deleted_at IS NULL`,
      [cabinetId],
    );
    const recipients = [c.contact_email, ...admins.map((a) => a.email)]
      .map((e) => String(e ?? '').trim().toLowerCase())
      .filter((e) => /^\S+@\S+\.\S+$/.test(e));
    return { id: c.id, name: c.name, code: c.code, recipients: [...new Set(recipients)] };
  }

  private async toCabinet(
    cabinetId: number,
    input: SimpleMailInput & {
      subject: string;
      withAction?: string;
      attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
    },
  ): Promise<boolean> {
    const cabinet = await this.cabinet(cabinetId);
    if (!cabinet?.recipients.length) return false;
    const action = input.withAction
      ? { label: input.withAction, url: `${frontendPublicUrl()}/t/${cabinet.code}/abonnement` }
      : input.action;
    return this.send(cabinet.recipients, {
      ...input,
      paragraphs: [`Bonjour ${cabinet.name},`, ...input.paragraphs],
      action,
    });
  }

  private async send(
    to: string | string[],
    input: SimpleMailInput & {
      subject: string;
      attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
    },
  ): Promise<boolean> {
    const issuer = await readBillingSetting(this.db, 'issuer');
    const mail = { ...input, brand: issuer.name || undefined };
    try {
      await this.mail.sendDirect({
        to,
        subject: input.subject,
        html: renderSimpleMail(mail),
        text: renderSimpleText(mail),
        attachments: input.attachments,
        transport: 'platform',
      });
      return true;
    } catch (error) {
      this.logger.warn(`Email « ${input.subject} » non envoyé : ${(error as Error).message}`);
      return false;
    }
  }
}
