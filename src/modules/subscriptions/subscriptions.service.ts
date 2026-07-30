import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, LessThan, Repository, In } from 'typeorm';

import { Subscription, BillingCycle } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { Plan } from '../plans/entities/plan.entity';
import { PaymentGatewayService } from './payment/payment-gateway.service';
import {
  addCycle,
  daysRemaining,
  isFreePlan,
  planPriceForCycle,
  resolveInitialPeriod,
  resolveRenewalPeriod,
} from './subscriptions.policy';

export interface PendingPaymentInfo {
  id: number;
  amount: number;
  currency: string;
  provider: string | null;
  reference: string | null;
  checkout_url: string | null;
}

export interface CurrentSubscription {
  subscription: Subscription | null;
  plan: Plan | null;
  days_remaining: number | null;
  /** Vrai quand la fin approche (<= seuil) ou est dépassée. */
  is_expiring: boolean;
  is_expired: boolean;
  cabinet_status: string | null;
  /** Vrai quand un paiement doit être réglé pour (ré)activer l'abonnement. */
  requires_payment: boolean;
  /** Échéance à régler (avec l'URL de la passerelle), si requires_payment. */
  pending_payment: PendingPaymentInfo | null;
}

/** Seuil (jours) à partir duquel on considère que l'abonnement « expire bientôt ». */
const EXPIRING_SOON_THRESHOLD_DAYS = 7;

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPayment)
    private readonly payRepo: Repository<SubscriptionPayment>,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    private readonly gateway: PaymentGatewayService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Une période exige un paiement amont si elle est payante et hors essai. */
  private requiresUpfrontPayment(period: { is_trial: boolean; amount: number }): boolean {
    return !period.is_trial && Number(period.amount) > 0;
  }

  /** Met le cabinet en attente de paiement (pas d'accès tant que non réglé). */
  private async holdCabinetForPayment(cabinetId: number, planId: number): Promise<void> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    if (!cabinet) return;
    cabinet.status = 'suspended';
    if (planId) cabinet.plan_id = planId;
    await this.cabinetRepo.save(cabinet);
  }

  // ── Création (onboarding / changement de plan) ────────────────────────────

  /**
   * Crée un abonnement actif pour un cabinet selon la politique configurée,
   * et génère l'échéance de paiement initiale (statut `pending`).
   *
   * Annule au préalable tout abonnement encore actif/essai du cabinet.
   */
  async createForCabinet(
    cabinetId: number,
    planId: number | null,
    cycle: BillingCycle = 'monthly',
    opts?: { gateAllPaid?: boolean },
  ): Promise<Subscription> {
    const plan = planId
      ? await this.planRepo.findOne({ where: { id: planId } })
      : null;

    // Clore les abonnements en cours (un seul abonnement vivant par cabinet)
    await this.subRepo.update(
      { cabinet_id: cabinetId, status: In(['trial', 'active']) },
      { status: 'cancelled' },
    );

    const startedAt = new Date();
    // On conserve TOUJOURS l'essai éventuel du plan (is_trial / trial_ends_at).
    const period = resolveInitialPeriod(plan, cycle, startedAt);
    const currency = await this.resolveCurrency(cabinetId);

    // Gating :
    //  - gateAllPaid (onboarding) → tout plan PAYANT exige le paiement amont,
    //    MÊME avec essai. L'essai (is_trial/trial_ends_at) est préservé et
    //    reprend ses droits dès la confirmation du paiement.
    //  - sinon → politique standard (paiement seulement si payant ET sans essai).
    const paidPlan = !isFreePlan(plan) && Number(period.amount) > 0;
    const gated = (opts?.gateAllPaid && paidPlan) || this.requiresUpfrontPayment(period);

    const sub = this.subRepo.create({
      cabinet_id: cabinetId,
      plan_id: plan?.id ?? planId ?? 0,
      billing_cycle: cycle,
      // pending_payment masque temporairement l'essai ; is_trial reste vrai et
      // est réappliqué à la confirmation du paiement (confirmPayment).
      status: gated ? 'pending_payment' : period.is_trial ? 'trial' : 'active',
      started_at: startedAt,
      ends_at: period.ends_at,
      trial_ends_at: period.trial_ends_at,
      is_trial: period.is_trial,
      amount: period.amount,
      currency,
      auto_renew: true,
    });
    const saved = await this.subRepo.save(sub);

    const payment = await this.createPaymentForPeriod(saved, period.amount, startedAt, period.ends_at);
    if (gated) {
      await this.gateway.initiate(payment); // session de paiement (provider + url)
      await this.holdCabinetForPayment(cabinetId, saved.plan_id);
    } else {
      await this.syncCabinet(cabinetId, saved);
    }

    this.logger.log(
      `[Subscriptions] Abonnement créé — cabinet=${cabinetId} plan=${saved.plan_id} ` +
        `cycle=${cycle} status=${saved.status} ends_at=${saved.ends_at?.toISOString() ?? 'illimité'}`,
    );
    return saved;
  }

  /**
   * Renouvelle l'abonnement courant : démarre une NOUVELLE période payante
   * (jamais un essai), réactive le cabinet (`active`) et génère l'échéance
   * correspondante. Conserve le plan actuel ; le cycle peut être ajusté.
   *
   * Utilisé par le bouton « Renouveler » lorsqu'un essai/abonnement est échu
   * et le cabinet suspendu.
   */
  async renewForCabinet(
    cabinetId: number,
    cycle?: BillingCycle,
  ): Promise<Subscription> {
    const current = await this.getRawCurrent(cabinetId);
    const planId = current?.plan_id ?? null;
    const targetCycle = cycle ?? current?.billing_cycle ?? 'monthly';
    const plan = planId
      ? await this.planRepo.findOne({ where: { id: planId } })
      : null;

    // Clore l'abonnement échu/suspendu en cours.
    await this.subRepo.update(
      { cabinet_id: cabinetId, status: In(['trial', 'active', 'expired', 'suspended']) },
      { status: 'cancelled' },
    );

    const startedAt = new Date();
    const period = resolveRenewalPeriod(plan, targetCycle, startedAt);
    const currency = await this.resolveCurrency(cabinetId);
    // Renouvellement payant → attente de paiement avant réactivation.
    // Plan gratuit (montant 0) → réactivation immédiate.
    const gated = this.requiresUpfrontPayment(period);

    const sub = this.subRepo.create({
      cabinet_id: cabinetId,
      plan_id: plan?.id ?? planId ?? 0,
      billing_cycle: targetCycle,
      status: gated ? 'pending_payment' : 'active',
      started_at: startedAt,
      ends_at: period.ends_at,
      trial_ends_at: null, // un renouvellement n'est jamais un essai
      is_trial: false,
      amount: period.amount,
      currency,
      auto_renew: true,
    });
    const saved = await this.subRepo.save(sub);

    const payment = await this.createPaymentForPeriod(saved, period.amount, startedAt, period.ends_at);
    if (gated) {
      await this.gateway.initiate(payment);
      // Le cabinet reste suspendu jusqu'à confirmation du paiement.
    } else {
      await this.syncCabinet(cabinetId, saved); // repasse le cabinet en 'active'
    }

    this.logger.log(
      `[Subscriptions] Renouvellement — cabinet=${cabinetId} cycle=${targetCycle} ` +
        `status=${saved.status} ends_at=${saved.ends_at?.toISOString() ?? 'illimité'}`,
    );
    return saved;
  }

  /**
   * Change le plan et/ou le cycle.
   *
   *  - Changement de PLAN → nouvelle période (nouvelle ligne de facturation) :
   *    l'ancien plan est clôturé, un nouvel abonnement + une échéance sont créés.
   *  - Changement de CYCLE seul (même plan) → mise à jour EN PLACE : on ajuste
   *    le cycle, la date de fin et l'échéance courante SANS créer de nouvelle
   *    ligne d'historique (un changement mensuel↔annuel n'est pas une nouvelle
   *    facturation).
   */
  async changePlanOrCycle(
    cabinetId: number,
    opts: { planId?: number; cycle?: BillingCycle },
  ): Promise<Subscription> {
    const current = await this.getRawCurrent(cabinetId);

    // Pas d'abonnement vivant → on en crée un.
    if (!current || current.status === 'cancelled') {
      return this.createForCabinet(
        cabinetId,
        opts.planId ?? current?.plan_id ?? null,
        opts.cycle ?? current?.billing_cycle ?? 'monthly',
      );
    }

    const targetPlanId = opts.planId ?? current.plan_id;
    const targetCycle = opts.cycle ?? current.billing_cycle;

    // Changement de plan → vraie nouvelle période.
    if (targetPlanId !== current.plan_id) {
      return this.createForCabinet(cabinetId, targetPlanId, targetCycle);
    }

    // Changement de cycle uniquement → mise à jour en place.
    if (targetCycle !== current.billing_cycle) {
      return this.updateCycleInPlace(current, targetCycle);
    }

    return current; // rien à changer
  }

  /**
   * Met à jour le cycle de l'abonnement courant sans créer de nouvelle ligne
   * de facturation. Recalcule la date de fin (hors essai) et ajuste l'échéance
   * `pending` existante.
   */
  private async updateCycleInPlace(
    sub: Subscription,
    cycle: BillingCycle,
  ): Promise<Subscription> {
    const plan = sub.plan ?? (await this.planRepo.findOne({ where: { id: sub.plan_id } }));

    sub.billing_cycle = cycle;
    if (sub.is_trial && sub.trial_ends_at) {
      // Essai en cours : on garde l'essai intact, on recale juste la période
      // payante qui suivra (ends_at = fin d'essai + nouveau cycle) et le montant.
      sub.ends_at = addCycle(new Date(sub.trial_ends_at), cycle);
      sub.amount = planPriceForCycle(plan, cycle);
    } else if (!(isFreePlan(plan) && !sub.ends_at)) {
      // Période payante en cours : on recalibre la fin sur le nouveau cycle.
      sub.ends_at = addCycle(new Date(sub.started_at), cycle);
      sub.amount = planPriceForCycle(plan, cycle);
    }
    const saved = await this.subRepo.save(sub);

    // Ajuste l'échéance la plus récente (au lieu d'en créer une nouvelle).
    const lastPayment = await this.payRepo.findOne({
      where: { subscription_id: sub.id },
      order: { id: 'DESC' },
    });
    if (lastPayment && lastPayment.status === 'pending') {
      lastPayment.amount = saved.amount;
      lastPayment.period_end = saved.ends_at;
      await this.payRepo.save(lastPayment);
    }

    await this.syncCabinet(sub.cabinet_id, saved);
    this.logger.log(
      `[Subscriptions] Cycle mis à jour en place — cabinet=${sub.cabinet_id} cycle=${cycle}`,
    );
    return saved;
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  /** Abonnement courant brut (le plus récent non annulé), sans calcul. */
  private async getRawCurrent(cabinetId: number): Promise<Subscription | null> {
    return this.subRepo.findOne({
      where: {
        cabinet_id: cabinetId,
        status: In(['trial', 'active', 'expired', 'suspended', 'pending_payment']),
      },
      order: { created_at: 'DESC' },
    });
  }

  /** État d'abonnement enrichi pour le front (bannière + page abonnement). */
  async getCurrent(cabinetId: number): Promise<CurrentSubscription> {
    let sub = await this.getRawCurrent(cabinetId);

    // Vérification paresseuse de l'échéance
    if (sub) sub = await this.expireIfDue(sub);

    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    // Pendant l'essai, le décompte vise la fin d'essai ; sinon la fin de période.
    const countdownTarget =
      sub?.is_trial ? sub.trial_ends_at ?? sub.ends_at ?? null : sub?.ends_at ?? null;
    const remaining = daysRemaining(countdownTarget);
    const requiresPayment = sub?.status === 'pending_payment';
    const isExpired =
      !requiresPayment &&
      (sub?.status === 'expired' || sub?.status === 'suspended' ||
        (remaining !== null && remaining < 0));

    // Échéance à régler (pour afficher le bouton « Payer » + l'URL passerelle).
    let pendingPayment: PendingPaymentInfo | null = null;
    if (requiresPayment && sub) {
      const p = await this.payRepo.findOne({
        where: { subscription_id: sub.id, status: 'pending' },
        order: { id: 'DESC' },
      });
      if (p) {
        pendingPayment = {
          id: p.id,
          amount: Number(p.amount),
          currency: p.currency,
          provider: p.provider,
          reference: p.reference,
          checkout_url: p.checkout_url,
        };
      }
    }

    return {
      subscription: sub,
      plan: sub?.plan ?? null,
      days_remaining: requiresPayment ? null : remaining,
      is_expiring:
        !isExpired && !requiresPayment && remaining !== null && remaining <= EXPIRING_SOON_THRESHOLD_DAYS,
      is_expired: isExpired,
      cabinet_status: cabinet?.status ?? null,
      requires_payment: requiresPayment,
      pending_payment: pendingPayment,
    };
  }

  /**
   * Rafraîchit l'état d'abonnement d'un cabinet (transition essai→payant /
   * suspension) sans construire la réponse enrichie. Utilisé par le guard
   * global pour mettre l'abonnement à jour avant de traiter une requête.
   */
  async refreshCabinetSubscription(cabinetId: number): Promise<void> {
    const sub = await this.getRawCurrent(cabinetId);
    if (sub) await this.expireIfDue(sub);
  }

  /** Historique de facturation du cabinet (échéances + paiements). */
  async listPayments(cabinetId: number): Promise<SubscriptionPayment[]> {
    return this.payRepo.find({
      where: { cabinet_id: cabinetId },
      order: { due_date: 'DESC' },
    });
  }

  // ── Paiement (passerelle) ─────────────────────────────────────────────────

  /**
   * (Ré)initie une session de paiement pour l'échéance en attente du cabinet et
   * retourne l'URL de la passerelle. Utilisé par le bouton « Payer ».
   */
  async initiatePaymentForCurrent(cabinetId: number): Promise<{
    payment_id: number;
    provider: string;
    reference: string;
    checkout_url: string;
  }> {
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    const payment = await this.payRepo.findOne({
      where: { subscription_id: sub.id, status: 'pending' },
      order: { id: 'DESC' },
    });
    if (!payment) throw new BadRequestException('Aucune échéance à régler');
    if (Number(payment.amount) <= 0) {
      throw new BadRequestException('Cette échéance ne nécessite pas de paiement');
    }
    const res = await this.gateway.initiate(payment);
    return {
      payment_id: payment.id,
      provider: this.gateway.providerName,
      reference: res.reference,
      checkout_url: res.checkoutUrl,
    };
  }

  /**
   * Confirme un encaissement : marque l'échéance payée, active l'abonnement
   * (pending_payment → active) et réactive le cabinet. Idempotent.
   */
  async confirmPayment(payment: SubscriptionPayment): Promise<Subscription | null> {
    if (payment.status !== 'paid') {
      payment.status = 'paid';
      payment.paid_at = new Date();
      payment.method = payment.method ?? this.gateway.providerName;
      await this.payRepo.save(payment);
    }

    const sub = await this.subRepo.findOne({ where: { id: payment.subscription_id } });
    if (sub && sub.status !== 'cancelled') {
      // Paiement confirmé → on lève le verrou. Si le plan comporte un essai, on
      // (re)passe en 'trial' (l'essai s'applique après paiement) ; sinon 'active'.
      if (sub.status === 'pending_payment') {
        sub.status = sub.is_trial ? 'trial' : 'active';
      }
      await this.subRepo.save(sub);
      await this.syncCabinet(sub.cabinet_id, sub);
      this.logger.log(
        `[Subscriptions] Paiement #${payment.id} confirmé — cabinet=${payment.cabinet_id} ` +
          `→ ${sub.status}`,
      );
    }
    return sub;
  }

  /** Webhook passerelle signé et idempotent, identifié par un événement unique. */
  async handleWebhook(
    reference: string,
    eventId: string,
    status: 'paid' | 'failed' = 'paid',
  ): Promise<void> {
    if (!reference) throw new BadRequestException('Référence manquante');
    if (!eventId) throw new BadRequestException('Identifiant d’événement manquant');
    await this.dataSource.transaction('SERIALIZABLE', async manager => {
      const insertion = await manager.query(
        `INSERT IGNORE INTO subscription_webhook_events
           (event_id, payment_reference, payment_status, received_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(6))`,
        [eventId, reference, status],
      );
      const affectedRows = Number(
        insertion?.affectedRows ?? insertion?.[0]?.affectedRows ?? 0,
      );
      if (affectedRows === 0) return;

      const paymentRepository = manager.getRepository(SubscriptionPayment);
      const subscriptionRepository = manager.getRepository(Subscription);
      const cabinetRepository = manager.getRepository(Cabinet);
      const payment = await paymentRepository
        .createQueryBuilder('payment')
        .setLock('pessimistic_write')
        .where('payment.reference = :reference', { reference })
        .getOne();
      if (!payment) throw new NotFoundException('Paiement introuvable');

      payment.last_webhook_event_id = eventId;
      payment.last_webhook_at = new Date();
      if (payment.status !== 'paid') {
        if (status === 'failed') {
          payment.status = 'failed';
        } else {
          payment.status = 'paid';
          payment.paid_at = new Date();
          payment.method = payment.method ?? this.gateway.providerName;
        }
      }
      await paymentRepository.save(payment);

      if (status === 'paid') {
        const subscription = await subscriptionRepository
          .createQueryBuilder('subscription')
          .setLock('pessimistic_write')
          .where('subscription.id = :id', { id: payment.subscription_id })
          .getOne();
        if (subscription && subscription.status !== 'cancelled') {
          if (subscription.status === 'pending_payment') {
            subscription.status = subscription.is_trial ? 'trial' : 'active';
          }
          await subscriptionRepository.save(subscription);
          const cabinet = await cabinetRepository
            .createQueryBuilder('cabinet')
            .setLock('pessimistic_write')
            .where('cabinet.id = :id', { id: subscription.cabinet_id })
            .getOne();
          if (cabinet) {
            cabinet.status = subscription.is_trial ? 'trial' : 'active';
            cabinet.trial_ends_at = subscription.ends_at;
            cabinet.plan_id = subscription.plan_id || cabinet.plan_id;
            await cabinetRepository.save(cabinet);
          }
        }
      }

      await manager.query(
        `UPDATE subscription_webhook_events
         SET payment_id = ?, processed_at = UTC_TIMESTAMP(6)
         WHERE event_id = ?`,
        [payment.id, eventId],
      );
    });
  }

  /**
   * [TEST] Simule un encaissement réussi pour une échéance du cabinet.
   * Disponible uniquement avec la passerelle de test.
   */
  async simulatePayment(cabinetId: number, paymentId?: number): Promise<CurrentSubscription> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Simulation indisponible en production');
    }
    if (!this.gateway.isTest) {
      throw new ForbiddenException('Simulation indisponible : passerelle réelle active');
    }
    const where = paymentId
      ? { id: paymentId, cabinet_id: cabinetId }
      : undefined;
    const payment = where
      ? await this.payRepo.findOne({ where })
      : await this.payRepo.findOne({
          where: { cabinet_id: cabinetId, status: 'pending' },
          order: { id: 'DESC' },
        });
    if (!payment) throw new NotFoundException('Aucune échéance à régler');
    await this.confirmPayment(payment);
    return this.getCurrent(cabinetId);
  }

  // ── Expiration & renouvellement ─────────────────────────────────────────────

  /**
   * Si l'abonnement a dépassé sa date de fin : on renouvelle (si auto_renew) ou
   * on suspend le cabinet. Retourne l'abonnement à jour.
   */
  private async expireIfDue(sub: Subscription): Promise<Subscription> {
    const now = Date.now();

    // En attente de paiement : ni transition d'essai ni suspension automatique
    // (le cabinet est déjà bloqué tant que le paiement n'est pas confirmé).
    if (sub.status === 'pending_payment') return sub;

    // ── Phase 1 : fin de l'essai → bascule en période payante (active) ────────
    // L'essai et la période payante sont empilés dans la même ligne : quand on
    // dépasse trial_ends_at, on quitte l'essai et le décompte payant (vers
    // ends_at) prend le relais. Le cabinet repasse 'active'.
    if (
      sub.is_trial &&
      sub.trial_ends_at &&
      new Date(sub.trial_ends_at).getTime() <= now &&
      (sub.status === 'trial' || sub.status === 'active')
    ) {
      sub.is_trial = false;
      sub.status = 'active';
      await this.subRepo.save(sub);
      await this.syncCabinet(sub.cabinet_id, sub);
      this.logger.log(
        `[Subscriptions] Essai terminé — cabinet=${sub.cabinet_id} → période payante ` +
          `(ends_at=${sub.ends_at?.toISOString() ?? 'illimité'})`,
      );
    }

    // ── Phase 2 : fin de la période payante → suspension ──────────────────────
    if (!sub.ends_at) return sub; // illimité
    if (new Date(sub.ends_at).getTime() > now) return sub; // pas encore échu
    if (sub.status === 'expired' || sub.status === 'suspended' || sub.status === 'cancelled') {
      return sub;
    }

    // Échéance atteinte → pas de paiement réel pour l'instant : on suspend.
    // (Le renouvellement automatique reste possible si activé explicitement et
    //  qu'un paiement existera un jour ; aujourd'hui on applique la suspension.)
    sub.status = 'suspended';
    await this.subRepo.save(sub);
    await this.suspendCabinet(sub.cabinet_id);
    this.logger.warn(
      `[Subscriptions] Abonnement échu — cabinet=${sub.cabinet_id} suspendu`,
    );
    return sub;
  }

  /**
   * Tâche planifiée quotidienne : suspend les cabinets dont l'abonnement est
   * arrivé à échéance. Filet de sécurité en plus de la vérification paresseuse.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireDueSubscriptions(): Promise<void> {
    const now = new Date();
    // Abonnements dont la période payante OU la période d'essai est arrivée à
    // échéance. On délègue la décision (transition essai→payant / suspension) à
    // expireIfDue pour garder une seule source de vérité.
    const due = await this.subRepo.find({
      where: [
        { status: In(['trial', 'active']), ends_at: LessThan(now) },
        { status: In(['trial', 'active']), trial_ends_at: LessThan(now) },
      ],
    });
    if (!due.length) return;
    this.logger.log(`[Subscriptions] ${due.length} abonnement(s) à traiter (essai/échéance)…`);
    for (const sub of due) {
      await this.expireIfDue(sub);
    }
  }

  /**
   * [Opt-in] Supprime les cabinets restés en attente de paiement (jamais
   * réglés) au-delà de CLEANUP_UNPAID_CABINETS_DAYS jours. DÉSACTIVÉ par défaut
   * (variable d'env absente ou ≤ 0). Évite l'accumulation de cabinets fantômes
   * dans le modèle « créer-puis-verrouiller ».
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupUnpaidCabinets(): Promise<void> {
    const days = Number(process.env.CLEANUP_UNPAID_CABINETS_DAYS ?? 0);
    if (!days || days <= 0) return; // désactivé

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const stale = await this.subRepo.find({
      where: { status: 'pending_payment', created_at: LessThan(cutoff) },
    });
    if (!stale.length) return;

    this.logger.warn(`[Cleanup] ${stale.length} cabinet(s) non payé(s) à purger (> ${days} j)`);
    for (const sub of stale) {
      try {
        await this.purgeUnpaidCabinet(sub.cabinet_id);
      } catch (e: any) {
        this.logger.error(`[Cleanup] échec cabinet=${sub.cabinet_id}: ${e?.message ?? e}`);
      }
    }
  }

  /** Tables portant une colonne tenant_id (données propres aux cabinets). */
  private async tenantTables(): Promise<string[]> {
    const db = process.env.DB_NAME || 'core';
    const rows: Array<{ t: string }> = await this.dataSource.query(
      `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'tenant_id'`,
      [db],
    );
    return rows.map((r) => r.t).filter(Boolean);
  }

  /** Purge complète d'un cabinet jamais payé (données tenant + users + abonnement). */
  private async purgeUnpaidCabinet(cabinetId: number): Promise<void> {
    // Sécurité absolue : ne jamais supprimer un cabinet ayant déjà payé.
    const paid = await this.payRepo.count({ where: { cabinet_id: cabinetId, status: 'paid' } });
    if (paid > 0) return;

    const tables = await this.tenantTables();
    await this.dataSource.transaction(async (m) => {
      const emps: Array<{ id: number }> = await m.query(
        'SELECT id FROM employee WHERE tenant_id = ?',
        [cabinetId],
      );
      const empIds = emps.map((e) => e.id);

      // FK off : permet de supprimer dans n'importe quel ordre sans violer les
      // contraintes (purge totale d'un tenant).
      await m.query('SET FOREIGN_KEY_CHECKS=0');
      try {
        for (const t of tables) {
          await m.query(`DELETE FROM \`${t}\` WHERE tenant_id = ?`, [cabinetId]);
        }
        if (empIds.length) {
          await m.query('DELETE FROM `user` WHERE id IN (?)', [empIds]);
        }
        await m.query('DELETE FROM subscription_payments WHERE cabinet_id = ?', [cabinetId]);
        await m.query('DELETE FROM subscriptions WHERE cabinet_id = ?', [cabinetId]);
        await m.query('DELETE FROM cabinets WHERE id = ?', [cabinetId]);
      } finally {
        await m.query('SET FOREIGN_KEY_CHECKS=1');
      }
    });
    this.logger.warn(`[Cleanup] cabinet non payé supprimé: ${cabinetId}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async createPaymentForPeriod(
    sub: Subscription,
    amount: number,
    periodStart: Date,
    periodEnd: Date | null,
  ): Promise<SubscriptionPayment> {
    const payment = this.payRepo.create({
      subscription_id: sub.id,
      cabinet_id: sub.cabinet_id,
      amount,
      currency: sub.currency,
      status: 'pending',
      due_date: periodStart,
      paid_at: null,
      period_start: periodStart,
      period_end: periodEnd,
      method: null,
      reference: null,
    });
    return this.payRepo.save(payment);
  }

  /** Aligne le cabinet (status + trial_ends_at) sur l'abonnement courant. */
  private async syncCabinet(cabinetId: number, sub: Subscription): Promise<void> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    if (!cabinet) return;
    cabinet.status = sub.is_trial ? 'trial' : 'active';
    cabinet.trial_ends_at = sub.ends_at; // null = illimité
    cabinet.plan_id = sub.plan_id || cabinet.plan_id;
    await this.cabinetRepo.save(cabinet);
  }

  private async suspendCabinet(cabinetId: number): Promise<void> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    if (!cabinet || cabinet.status === 'suspended') return;
    cabinet.status = 'suspended';
    await this.cabinetRepo.save(cabinet);
  }

  private async resolveCurrency(cabinetId: number): Promise<string> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    return cabinet?.currency ?? 'XAF';
  }

  // ── Outils DEV (indisponibles en production) ───────────────────────────────

  private assertDev(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Outils de développement indisponibles en production');
    }
  }

  /**
   * Force la date de fin de l'abonnement courant à `now + days` (days négatif
   * = passé). Permet de tester la bannière « expire bientôt » / l'expiration.
   */
  async devSetEndsIn(cabinetId: number, days: number): Promise<CurrentSubscription> {
    this.assertDev();
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');

    const ends = new Date();
    ends.setDate(ends.getDate() + days);
    sub.ends_at = ends;
    await this.subRepo.save(sub);

    const lastPayment = await this.payRepo.findOne({
      where: { subscription_id: sub.id },
      order: { id: 'DESC' },
    });
    if (lastPayment) {
      lastPayment.period_end = ends;
      await this.payRepo.save(lastPayment);
    }
    await this.syncCabinet(cabinetId, sub);
    // getCurrent déclenche l'expiration paresseuse si la date est passée.
    return this.getCurrent(cabinetId);
  }

  /**
   * Termine immédiatement l'essai en cours → bascule en période payante.
   * Permet de vérifier la transition « fin d'essai → début du décompte payant ».
   */
  async devEndTrialNow(cabinetId: number): Promise<CurrentSubscription> {
    this.assertDev();
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    if (!sub.is_trial || !sub.trial_ends_at) {
      throw new ForbiddenException("L'abonnement courant n'est pas en période d'essai");
    }
    sub.trial_ends_at = new Date(Date.now() - 1000);
    await this.subRepo.save(sub);
    await this.expireIfDue(sub); // déclenche la transition essai→payant
    return this.getCurrent(cabinetId);
  }

  /** Expire immédiatement l'abonnement courant → suspend le cabinet. */
  async devExpireNow(cabinetId: number): Promise<CurrentSubscription> {
    this.assertDev();
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    sub.ends_at = new Date(Date.now() - 1000);
    await this.subRepo.save(sub);
    await this.expireIfDue(sub);
    return this.getCurrent(cabinetId);
  }

  /** Recrée un essai neuf (selon la politique) pour le plan courant. */
  async devResetTrial(cabinetId: number): Promise<CurrentSubscription> {
    this.assertDev();
    const sub = await this.getRawCurrent(cabinetId);
    await this.createForCabinet(
      cabinetId,
      sub?.plan_id ?? null,
      sub?.billing_cycle ?? 'monthly',
    );
    return this.getCurrent(cabinetId);
  }
}
