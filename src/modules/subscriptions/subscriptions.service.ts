import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, IsNull, LessThan, Repository, In } from 'typeorm';

import { Subscription, BillingCycle } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import {
  Cabinet,
  CabinetSuspensionReason,
} from '../cabinet/entities/cabinet.entity';
import { Plan } from '../plans/entities/plan.entity';
import {
  PaymentCustomer,
  PaymentGatewayService,
  PaymentStartResult,
} from './payment/payment-gateway.service';
import { PaymentMethodsService } from './payment/payment-methods.service';
import { AiCreditsService } from '../plans/ai-credits/ai-credits.service';
import { withoutCreditAllowance } from '../plans/ai-credits/ai-credits';
import { ReceiptService } from './billing/receipt.service';
import { CouponQuote, CouponsService, computeDiscount } from './coupons/coupons.service';
import {
  resolvePaymentProof,
  savePaymentProof,
} from './payment/payment-proof.storage';
import { isPaymentTestEnabled } from './payment/payment-test-mode';
import {
  SubscriptionActor,
  SubscriptionEventsService,
  SYSTEM_ACTOR,
} from './subscription-events.service';
import type { SubscriptionEventType } from './entities/subscription-event.entity';
import {
  addCycle,
  addDays,
  addMonths,
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
  status?: string;
  method?: string | null;
  declared_at?: Date | null;
  failure_reason?: string | null;
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

export function isManuallySuspended(cabinet: Cabinet): boolean {
  return cabinet.status === 'suspended' && cabinet.suspension_reason === 'manual';
}

function clearSuspension(cabinet: Cabinet) {
  cabinet.suspension_reason = null;
  cabinet.suspended_at = null;
  cabinet.suspended_by_admin_id = null;
  cabinet.suspension_note = null;
}

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
    private readonly methods: PaymentMethodsService,
    private readonly receipts: ReceiptService,
    private readonly coupons: CouponsService,
    private readonly events: SubscriptionEventsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly aiCredits: AiCreditsService,
    @Optional() private readonly appEvents?: EventEmitter2,
  ) {}

  /** Une période exige un paiement amont si elle est payante et hors essai. */
  private requiresUpfrontPayment(period: {
    is_trial: boolean;
    amount: number;
  }): boolean {
    return !period.is_trial && Number(period.amount) > 0;
  }

  /** Met le cabinet en attente de paiement (pas d'accès tant que non réglé). */
  private async holdCabinetForPayment(
    cabinetId: number,
    planId: number,
  ): Promise<void> {
    const cabinet = await this.cabinetRepo.findOne({
      where: { id: cabinetId },
    });
    if (!cabinet) return;
    if (planId) cabinet.plan_id = planId;
    this.markSuspended(cabinet, 'payment_required');
    await this.cabinetRepo.save(cabinet);
    this.appEvents?.emit('ai.config.changed', { tenantId: cabinetId });
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
    opts?: {
      gateAllPaid?: boolean;
      actor?: SubscriptionActor;
      eventType?: SubscriptionEventType;
      eventPayload?: Record<string, any>;
      couponCode?: string | null;
    },
  ): Promise<Subscription> {
    const actor = opts?.actor ?? SYSTEM_ACTOR;
    const plan = planId
      ? await this.planRepo.findOne({ where: { id: planId } })
      : null;

    // Code promo vérifié AVANT toute modification (erreur claire, rien de créé).
    const precheck = opts?.couponCode
      ? await this.coupons.check(opts.couponCode, { cabinetId, planId: plan?.id ?? planId, cycle })
      : null;

    // Clore les abonnements en cours (un seul abonnement vivant par cabinet)
    await this.closeLiveSubscriptions(
      cabinetId,
      ['trial', 'active', 'pending_payment', 'expired', 'suspended'],
      'replaced',
    );

    const startedAt = new Date();
    // On conserve TOUJOURS l'essai éventuel du plan (is_trial / trial_ends_at).
    const period = resolveInitialPeriod(plan, cycle, startedAt);
    const currency = await this.resolveCurrency(cabinetId);
    const quote = precheck ? await this.applyQuote(precheck, period, currency, startedAt) : null;
    const due = quote ? quote.net : Number(period.amount);

    // Gating :
    //  - gateAllPaid (onboarding) → tout plan PAYANT exige le paiement amont,
    //    MÊME avec essai. L'essai (is_trial/trial_ends_at) est préservé et
    //    reprend ses droits dès la confirmation du paiement.
    //  - sinon → politique standard (paiement seulement si payant ET sans essai).
    const paidPlan = !isFreePlan(plan) && due > 0;
    const gated =
      (opts?.gateAllPaid && paidPlan) ||
      this.requiresUpfrontPayment({ is_trial: period.is_trial, amount: due });

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
      created_by: actor.type,
      coupon_id: quote?.coupon.id ?? null,
      discount_cycles_remaining: quote ? Math.max(0, (quote.coupon.duration_cycles ?? 1) - 1) : null,
    });
    const saved = await this.subRepo.save(sub);

    const payment = await this.createPaymentForPeriod(
      saved,
      period.amount,
      startedAt,
      period.ends_at,
      quote,
    );
    if (quote) await this.recordCoupon(quote, saved, payment.id, actor);
    if (gated) {
      // Le cabinet choisit ensuite son moyen de paiement (POST /subscriptions/pay).
      void payment;
      await this.holdCabinetForPayment(cabinetId, saved.plan_id);
    } else {
      await this.syncCabinet(cabinetId, saved);
    }
    await this.events.record({
      cabinetId,
      subscriptionId: saved.id,
      type: opts?.eventType ?? 'created',
      actor,
      payload: {
        plan_id: saved.plan_id,
        cycle,
        amount: Number(saved.amount),
        status: saved.status,
        ...(opts?.eventPayload ?? {}),
      },
    });

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
    actor: SubscriptionActor = SYSTEM_ACTOR,
    couponCode?: string | null,
  ): Promise<Subscription> {
    const current = await this.getRawCurrent(cabinetId);
    const planId = current?.plan_id ?? null;
    const targetCycle = cycle ?? current?.billing_cycle ?? 'monthly';
    const plan = planId
      ? await this.planRepo.findOne({ where: { id: planId } })
      : null;
    const precheck = couponCode
      ? await this.coupons.check(couponCode, { cabinetId, planId, cycle: targetCycle })
      : null;
    // Coupon multi-échéances encore actif sur l'abonnement renouvelé.
    const carried =
      !precheck && current?.coupon_id && Number(current.discount_cycles_remaining ?? 0) > 0
        ? await this.coupons.findById(current.coupon_id)
        : null;

    // Clore l'abonnement échu/suspendu en cours.
    await this.closeLiveSubscriptions(
      cabinetId,
      ['trial', 'active', 'expired', 'suspended', 'pending_payment'],
      'renewed',
    );

    const startedAt = new Date();
    const period = resolveRenewalPeriod(plan, targetCycle, startedAt);
    const currency = await this.resolveCurrency(cabinetId);
    let quote: CouponQuote | null = null;
    let remaining: number | null = null;
    if (precheck) {
      quote = await this.applyQuote(precheck, period, currency, startedAt);
      remaining = Math.max(0, (precheck.duration_cycles ?? 1) - 1);
    } else if (carried) {
      const res = computeDiscount(carried, Number(period.amount), currency);
      if (res.free_months && period.ends_at) period.ends_at = addMonths(period.ends_at, res.free_months);
      quote = { coupon: carried, gross: Number(period.amount), ...res };
      remaining = Math.max(0, Number(current!.discount_cycles_remaining) - 1);
    }
    // Renouvellement payant → attente de paiement avant réactivation.
    // Plan gratuit (montant 0) → réactivation immédiate.
    const gated = this.requiresUpfrontPayment({
      is_trial: period.is_trial,
      amount: quote ? quote.net : Number(period.amount),
    });

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
      created_by: actor.type,
      coupon_id: quote?.coupon.id ?? null,
      discount_cycles_remaining: remaining,
    });
    const saved = await this.subRepo.save(sub);

    const payment = await this.createPaymentForPeriod(
      saved,
      period.amount,
      startedAt,
      period.ends_at,
      quote,
    );
    if (quote) await this.recordCoupon(quote, saved, payment.id, actor, !!carried);
    if (gated) {
      // Le cabinet reste suspendu jusqu'à confirmation du paiement (moyen
      // choisi ensuite via POST /subscriptions/pay).
      void payment;
    } else {
      await this.syncCabinet(cabinetId, saved); // repasse le cabinet en 'active'
    }
    await this.events.record({
      cabinetId,
      subscriptionId: saved.id,
      type: 'renewed',
      actor,
      payload: {
        plan_id: saved.plan_id,
        cycle: targetCycle,
        amount: Number(saved.amount),
        status: saved.status,
      },
    });

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
    opts: { planId?: number; cycle?: BillingCycle; couponCode?: string | null },
    actor: SubscriptionActor = SYSTEM_ACTOR,
  ): Promise<Subscription> {
    const current = await this.getRawCurrent(cabinetId);

    // Pas d'abonnement vivant → on en crée un.
    if (!current || current.status === 'cancelled') {
      return this.createForCabinet(
        cabinetId,
        opts.planId ?? current?.plan_id ?? null,
        opts.cycle ?? current?.billing_cycle ?? 'monthly',
        { actor, couponCode: opts.couponCode },
      );
    }

    const targetPlanId = opts.planId ?? current.plan_id;
    const targetCycle = opts.cycle ?? current.billing_cycle;

    // Changement de plan → vraie nouvelle période.
    if (targetPlanId !== current.plan_id) {
      return this.createForCabinet(cabinetId, targetPlanId, targetCycle, {
        actor,
        eventType: 'plan_changed',
        eventPayload: { from_plan_id: current.plan_id, mode: 'new_period' },
        couponCode: opts.couponCode,
      });
    }

    // Changement de cycle uniquement → mise à jour en place.
    if (targetCycle !== current.billing_cycle) {
      return this.updateCycleInPlace(current, targetCycle, actor);
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
    actor: SubscriptionActor = SYSTEM_ACTOR,
  ): Promise<Subscription> {
    const fromCycle = sub.billing_cycle;
    const plan =
      sub.plan ?? (await this.planRepo.findOne({ where: { id: sub.plan_id } }));

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
      where: { subscription_id: sub.id, kind: 'subscription' },
      order: { id: 'DESC' },
    });
    if (lastPayment && lastPayment.status === 'pending') {
      lastPayment.amount = saved.amount;
      lastPayment.period_end = saved.ends_at;
      await this.payRepo.save(lastPayment);
    }

    await this.syncCabinet(sub.cabinet_id, saved);
    await this.events.record({
      cabinetId: sub.cabinet_id,
      subscriptionId: sub.id,
      type: 'cycle_changed',
      actor,
      payload: { from: fromCycle, to: cycle, amount: Number(saved.amount) },
    });
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
        status: In([
          'trial',
          'active',
          'expired',
          'suspended',
          'pending_payment',
        ]),
      },
      order: { created_at: 'DESC' },
    });
  }

  /** État d'abonnement enrichi pour le front (bannière + page abonnement). */
  async getCurrent(cabinetId: number): Promise<CurrentSubscription> {
    let sub = await this.getRawCurrent(cabinetId);

    // Vérification paresseuse de l'échéance
    if (sub) sub = await this.expireIfDue(sub);

    const cabinet = await this.cabinetRepo.findOne({
      where: { id: cabinetId },
    });
    // Pendant l'essai, le décompte vise la fin d'essai ; sinon la fin de période.
    const countdownTarget = sub?.is_trial
      ? (sub.trial_ends_at ?? sub.ends_at ?? null)
      : (sub?.ends_at ?? null);
    const remaining = daysRemaining(countdownTarget);
    const requiresPayment = sub?.status === 'pending_payment';
    const isExpired =
      !requiresPayment &&
      (sub?.status === 'expired' ||
        sub?.status === 'suspended' ||
        (remaining !== null && remaining < 0));

    // Échéance à régler (pour afficher le bouton « Payer » + l'URL passerelle).
    let pendingPayment: PendingPaymentInfo | null = null;
    if (requiresPayment && sub) {
      const p = await this.payRepo.findOne({
        where: {
          subscription_id: sub.id,
          kind: 'subscription',
          status: In(['pending', 'awaiting_validation']),
        },
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
          status: p.status,
          method: p.method,
          declared_at: p.declared_at,
          failure_reason: p.failure_reason,
        };
      }
    }

    // Le cabinet ne voit jamais le nombre de crédits IA du forfait (pourcentages seulement).
    const visiblePlan = withoutCreditAllowance(sub?.plan ?? null);
    return {
      subscription: sub ? ({ ...sub, plan: visiblePlan } as Subscription) : null,
      plan: visiblePlan,
      days_remaining: requiresPayment ? null : remaining,
      is_expiring:
        !isExpired &&
        !requiresPayment &&
        remaining !== null &&
        remaining <= EXPIRING_SOON_THRESHOLD_DAYS,
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
  async listPayments(cabinetId: number) {
    const rows = await this.payRepo.find({
      where: {
        cabinet_id: cabinetId,
        kind: 'subscription',
        status: In(['pending', 'awaiting_validation', 'paid', 'failed', 'refunded']),
      },
      order: { due_date: 'DESC', id: 'DESC' },
    });
    return rows.map(({ provider_payload, proof_file, validated_by_admin_id, notes, ...rest }) => ({
      ...rest,
      has_proof: !!proof_file,
    }));
  }

  // ── Paiement (passerelle) ─────────────────────────────────────────────────

  /**
   * Démarre le paiement de l'échéance due avec le moyen choisi : session en
   * ligne (URL de la passerelle) ou instructions d'un moyen manuel.
   */
  async initiatePaymentForCurrent(
    cabinetId: number,
    input: { methodCode?: string; customer?: Partial<PaymentCustomer> } = {},
  ): Promise<PaymentStartResult> {
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    const payment = await this.payRepo.findOne({
      where: { subscription_id: sub.id, kind: 'subscription', status: In(['pending', 'awaiting_validation']) },
      order: { id: 'DESC' },
    });
    if (!payment) throw new BadRequestException('Aucune échéance à régler');
    if (payment.status === 'awaiting_validation') {
      throw new BadRequestException(
        'Un paiement a déjà été déclaré pour cette échéance : il est en cours de validation.',
      );
    }
    if (Number(payment.amount) <= 0) {
      throw new BadRequestException('Cette échéance ne nécessite pas de paiement');
    }
    const methodCode =
      input.methodCode ??
      (await this.methods.listActiveForCabinet(payment.currency))[0]?.code;
    if (!methodCode) {
      throw new BadRequestException('Aucun moyen de paiement disponible pour le moment.');
    }
    const method = await this.methods.resolveForPayment(methodCode);
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    const plan = sub.plan ?? (await this.planRepo.findOne({ where: { id: sub.plan_id } }));
    const description = `Abonnement ${plan?.name ?? ''} — ${cabinet?.name ?? `cabinet ${cabinetId}`}`.trim();
    return this.gateway.start(
      payment,
      method,
      {
        email: input.customer?.email ?? cabinet?.contact_email ?? null,
        name: input.customer?.name ?? cabinet?.name ?? null,
        phone: input.customer?.phone ?? cabinet?.contact_phone ?? null,
      },
      description,
    );
  }

  // ── Crédits IA ────────────────────────────────────────────────────────────

  /**
   * Démarre l'achat d'un pack de crédits IA : crée un paiement
   * `kind = 'ai_credits'` rattaché à l'abonnement courant puis réutilise le flux
   * des passerelles (en ligne, manuel, passerelle de test). Les crédits sont
   * ajoutés au ledger par `confirmPayment`, à l'encaissement.
   */
  async purchaseAiCredits(
    cabinetId: number,
    input: { packId: number; methodCode?: string; customer?: Partial<PaymentCustomer> },
  ): Promise<PaymentStartResult> {
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    const plan = sub.plan ?? (await this.planRepo.findOne({ where: { id: sub.plan_id } }));
    if (!plan?.ai_enabled) {
      throw new BadRequestException("L'assistant IA n'est pas inclus dans votre forfait.");
    }
    if (plan.ai_credits_per_month === null || plan.ai_credits_per_month === undefined || plan.ai_credits_per_month === -1) {
      throw new BadRequestException('Votre forfait inclut déjà un usage IA illimité.');
    }
    const pack = await this.aiCredits.findPack(Number(input.packId));
    if (!pack.is_active) throw new BadRequestException("Ce pack n'est plus proposé.");

    const methodCode =
      input.methodCode ?? (await this.methods.listActiveForCabinet(pack.currency))[0]?.code;
    if (!methodCode) throw new BadRequestException('Aucun moyen de paiement disponible pour le moment.');
    const method = await this.methods.resolveForPayment(methodCode);

    // Les tentatives jamais lancées auprès d'une passerelle (sans référence) sont
    // closes ; celles dont la session de paiement existe restent rapprochables.
    await this.payRepo.update(
      { cabinet_id: cabinetId, kind: 'ai_credits', status: 'pending', reference: IsNull() },
      { status: 'cancelled', notes: 'Achat de crédits IA remplacé par une nouvelle tentative' },
    );

    const today = new Date();
    const payment = await this.payRepo.save(
      this.payRepo.create({
        subscription_id: sub.id,
        cabinet_id: cabinetId,
        kind: 'ai_credits',
        ai_credit_pack_id: pack.id,
        ai_credits: pack.credits,
        amount: Number(pack.price),
        currency: pack.currency,
        status: 'pending',
        due_date: today,
        period_start: today,
        period_end: null,
      }),
    );
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    return this.gateway.start(
      payment,
      method,
      {
        email: input.customer?.email ?? cabinet?.contact_email ?? null,
        name: input.customer?.name ?? cabinet?.name ?? null,
        phone: input.customer?.phone ?? cabinet?.contact_phone ?? null,
      },
      `Crédits IA ${pack.name} — ${cabinet?.name ?? `cabinet ${cabinetId}`}`.trim(),
    );
  }

  /**
   * Historique des achats de crédits IA du cabinet (admin du cabinet) : pack,
   * prix payé, statut. Aucun nombre de crédits.
   */
  async listAiPurchases(cabinetId: number) {
    const rows: Array<Record<string, any>> = await this.dataSource.query(
      `SELECT sp.id, sp.amount, sp.currency, sp.status, sp.method, sp.provider, sp.paid_at, sp.created_at,
              sp.declared_at, sp.failure_reason, sp.receipt_number, sp.checkout_url, p.name AS pack_name
         FROM subscription_payments sp
         LEFT JOIN ai_credit_packs p ON p.id = sp.ai_credit_pack_id
        WHERE sp.cabinet_id = ? AND sp.kind = 'ai_credits'
          AND sp.status IN ('pending','awaiting_validation','paid','failed','refunded')
          AND (sp.status <> 'pending' OR sp.created_at > DATE_SUB(NOW(), INTERVAL 2 DAY))
        ORDER BY sp.created_at DESC, sp.id DESC
        LIMIT 100`,
      [cabinetId],
    );
    return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
  }

  /**
   * Relit l'état d'une transaction auprès de sa passerelle et l'applique :
   * confirmation si payée (montant contrôlé), motif d'échec sinon. Idempotent.
   */
  async reconcilePayment(payment: SubscriptionPayment): Promise<string> {
    if (payment.status === 'paid') return 'paid';
    if (payment.status !== 'pending') return payment.status;
    const result = await this.gateway.verify(payment);
    if (!result) return payment.status;
    payment.provider_payload = { ...(result.raw ?? {}), channel: result.channel ?? null };

    if (result.status === 'paid') {
      const due = Number(payment.amount);
      const sameCurrency =
        !result.currency || result.currency.toUpperCase() === payment.currency.toUpperCase();
      if (
        result.amount !== null &&
        result.amount !== undefined &&
        (!sameCurrency || Math.abs(Number(result.amount) - due) > 0.01)
      ) {
        payment.failure_reason = `Montant encaissé (${result.amount} ${result.currency ?? ''}) différent du montant dû (${due} ${payment.currency}) — à vérifier.`;
        await this.payRepo.save(payment);
        await this.events.record({
          cabinetId: payment.cabinet_id,
          subscriptionId: payment.subscription_id,
          type: 'payment_failed',
          payload: { payment_id: payment.id, reason: payment.failure_reason, kind: payment.kind ?? 'subscription' },
        });
        return 'pending';
      }
      await this.payRepo.save(payment);
      await this.confirmPayment(payment);
      return 'paid';
    }

    if (result.status === 'failed') {
      const already = payment.failure_reason === (result.failureReason ?? 'Paiement refusé');
      payment.failure_reason = result.failureReason ?? 'Paiement refusé';
      await this.payRepo.save(payment);
      if (!already) {
        await this.events.record({
          cabinetId: payment.cabinet_id,
          subscriptionId: payment.subscription_id,
          type: 'payment_failed',
          payload: {
            payment_id: payment.id,
            provider: payment.provider,
            reference: payment.reference,
            reason: payment.failure_reason,
            kind: payment.kind ?? 'subscription',
          },
        });
      }
      return 'failed';
    }
    await this.payRepo.save(payment);
    return 'pending';
  }

  /** Retrouve une échéance par notre référence ou celle de la passerelle. */
  findPaymentByReference(reference?: string | null, providerReference?: string | null) {
    const where: any[] = [];
    if (reference) where.push({ reference });
    if (providerReference) where.push({ provider_reference: providerReference });
    if (!where.length) return Promise.resolve(null);
    return this.payRepo.findOne({ where });
  }

  /** Retour navigateur / page abonnement : statut à jour d'une transaction. */
  async paymentStatusForCabinet(cabinetId: number, reference: string) {
    const payment = await this.payRepo.findOne({ where: { cabinet_id: cabinetId, reference } });
    if (!payment) throw new NotFoundException('Transaction introuvable');
    try {
      await this.reconcilePayment(payment);
    } catch (error) {
      this.logger.warn(`[Paiement] vérification ${reference} impossible : ${(error as Error).message}`);
    }
    const fresh = await this.payRepo.findOne({ where: { id: payment.id } });
    return {
      payment_id: fresh!.id,
      status: fresh!.status,
      failure_reason: fresh!.failure_reason,
      provider: fresh!.provider,
      reference: fresh!.reference,
      current: await this.getCurrent(cabinetId),
    };
  }

  /** Le cabinet déclare un paiement manuel (virement, Mobile Money direct…). */
  async declareManualPayment(
    cabinetId: number,
    paymentId: number,
    input: { methodCode: string; reference: string; note?: string },
    file: Express.Multer.File | undefined,
    actor: SubscriptionActor,
  ) {
    const payment = await this.payRepo.findOne({ where: { id: paymentId, cabinet_id: cabinetId } });
    if (!payment) throw new NotFoundException('Échéance introuvable');
    if (payment.status !== 'pending') {
      throw new BadRequestException("Cette échéance n'est pas en attente de paiement.");
    }
    const method = await this.methods.resolveForPayment(input.methodCode);
    if (method.kind !== 'manual') {
      throw new BadRequestException('Ce moyen de paiement se règle en ligne.');
    }
    const reference = String(input.reference ?? '').trim();
    if (reference.length < 3) {
      throw new BadRequestException('Indiquez la référence de votre paiement.');
    }
    payment.payment_method_id = method.id;
    payment.method = method.code.slice(0, 30);
    payment.provider = null;
    payment.declared_reference = reference.slice(0, 120);
    payment.declared_at = new Date();
    payment.notes = input.note?.slice(0, 500) || null;
    payment.failure_reason = null;
    if (file) payment.proof_file = await savePaymentProof(cabinetId, payment.id, file);
    payment.status = 'awaiting_validation';
    await this.payRepo.save(payment);
    await this.events.record({
      cabinetId,
      subscriptionId: payment.subscription_id,
      type: 'payment_declared',
      actor,
      payload: {
        payment_id: payment.id,
        method: method.code,
        reference: payment.declared_reference,
        amount: Number(payment.amount),
        has_proof: !!payment.proof_file,
      },
    });
    return this.getCurrent(cabinetId);
  }

  /** Justificatif d'une échéance du cabinet (chemin privé). */
  async proofFileForCabinet(cabinetId: number, paymentId: number) {
    const payment = await this.payRepo.findOne({ where: { id: paymentId, cabinet_id: cabinetId } });
    if (!payment) throw new NotFoundException('Échéance introuvable');
    return resolvePaymentProof(payment.proof_file);
  }

  /** Justificatif d'une échéance (lecture plateforme). */
  async proofFile(paymentId: number) {
    const payment = await this.payRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return resolvePaymentProof(payment.proof_file);
  }

  // ── Encaissements gérés par la plateforme ──────────────────────────────────

  private async requirePayment(paymentId: number) {
    const payment = await this.payRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');
    return payment;
  }

  /** Validation d'un paiement déclaré (ou en attente) après contrôle. */
  async validatePaymentByPlatform(
    paymentId: number,
    actor: SubscriptionActor,
    input: { reference?: string; note?: string } = {},
  ) {
    const payment = await this.requirePayment(paymentId);
    if (!['awaiting_validation', 'pending'].includes(payment.status)) {
      throw new BadRequestException('Seul un paiement en attente peut être validé.');
    }
    payment.validated_by_admin_id = actor.id ?? null;
    payment.validated_at = new Date();
    if (input.reference) payment.reference = input.reference.slice(0, 100);
    if (input.note) payment.notes = input.note.slice(0, 500);
    payment.method = payment.method ?? 'manual';
    payment.failure_reason = null;
    await this.payRepo.save(payment);
    await this.confirmPayment(payment, actor);
    return this.requirePayment(paymentId);
  }

  /** Refus d'une déclaration : l'échéance redevient due, avec le motif. */
  async rejectPaymentByPlatform(paymentId: number, actor: SubscriptionActor, reason: string) {
    const payment = await this.requirePayment(paymentId);
    if (payment.status !== 'awaiting_validation') {
      throw new BadRequestException('Seul un paiement déclaré peut être rejeté.');
    }
    payment.status = 'pending';
    payment.failure_reason = `Déclaration rejetée : ${reason}`.slice(0, 255);
    await this.payRepo.save(payment);
    await this.events.record({
      cabinetId: payment.cabinet_id,
      subscriptionId: payment.subscription_id,
      type: 'payment_rejected',
      actor,
      payload: { payment_id: payment.id, reason, declared_reference: payment.declared_reference },
    });
    return payment;
  }

  /**
   * Enregistre un encaissement reçu hors ligne (espèces, virement constaté…)
   * sur l'échéance due du cabinet (ou une échéance précise).
   */
  async recordPaymentByPlatform(
    cabinetId: number,
    actor: SubscriptionActor,
    input: { paymentId?: number; methodCode: string; reference?: string; paidAt?: string; note?: string },
  ) {
    const payment = input.paymentId
      ? await this.payRepo.findOne({ where: { id: input.paymentId, cabinet_id: cabinetId } })
      : await this.payRepo
          .createQueryBuilder('p')
          .innerJoin(Subscription, 's', 's.id = p.subscription_id')
          .where('p.cabinet_id = :cabinetId', { cabinetId })
          .andWhere("p.kind = 'subscription'")
          .andWhere("p.status IN ('pending','awaiting_validation')")
          .andWhere("s.status <> 'cancelled'")
          .orderBy('p.id', 'DESC')
          .getOne();
    if (!payment) throw new NotFoundException('Aucune échéance due pour ce cabinet.');
    if (!['pending', 'awaiting_validation'].includes(payment.status)) {
      throw new BadRequestException("Cette échéance n'est pas en attente de paiement.");
    }
    const method =
      input.methodCode === 'other' ? null : await this.methods.resolveForPayment(input.methodCode).catch(() => null);
    payment.payment_method_id = method?.id ?? payment.payment_method_id;
    payment.method = (method?.code ?? input.methodCode ?? 'manual').slice(0, 30);
    payment.reference = input.reference?.slice(0, 100) || payment.reference;
    payment.notes = input.note?.slice(0, 500) || payment.notes;
    payment.validated_by_admin_id = actor.id ?? null;
    payment.validated_at = new Date();
    payment.fee_amount = this.methods.feeFor(method, Number(payment.amount));
    await this.payRepo.save(payment);
    await this.events.record({
      cabinetId,
      subscriptionId: payment.subscription_id,
      type: 'payment_recorded',
      actor,
      payload: { payment_id: payment.id, amount: Number(payment.amount), method: payment.method, reference: payment.reference },
    });
    await this.confirmPayment(payment, actor);
    if (input.paidAt) {
      const paidAt = new Date(input.paidAt);
      if (!Number.isNaN(paidAt.getTime()) && paidAt.getTime() <= Date.now()) {
        await this.payRepo.update(payment.id, { paid_at: paidAt });
      }
    }
    return this.requirePayment(payment.id);
  }

  /**
   * Remboursement (total ou partiel). `viaProvider` tente l'API de la
   * passerelle (Stripe) ; sinon le remboursement est simplement enregistré.
   */
  async refundPaymentByPlatform(
    paymentId: number,
    actor: SubscriptionActor,
    input: { amount?: number; reason: string; viaProvider?: boolean },
  ) {
    const payment = await this.requirePayment(paymentId);
    if (payment.status !== 'paid') {
      throw new BadRequestException('Seul un paiement encaissé peut être remboursé.');
    }
    const paid = Number(payment.amount);
    const already = Number(payment.refund_amount ?? 0);
    const amount = Math.round(Number(input.amount ?? paid - already) * 100) / 100;
    if (!(amount > 0) || amount + already > paid + 0.001) {
      throw new BadRequestException(`Montant à rembourser invalide (reste remboursable : ${paid - already}).`);
    }
    let providerMessage: string | null = null;
    if (input.viaProvider) {
      const res = await this.gateway.refundViaProvider(payment, amount);
      if (!res.ok) throw new BadRequestException(res.message);
      providerMessage = res.message;
    }
    payment.refund_amount = already + amount;
    payment.refunded_at = new Date();
    payment.refund_reason = input.reason.slice(0, 255);
    if (payment.refund_amount >= paid - 0.001) payment.status = 'refunded';
    await this.payRepo.save(payment);
    if (payment.kind === 'ai_credits' && paid > 0) {
      // Les crédits vendus par ce paiement sont retirés au prorata du remboursement.
      await this.aiCredits.refundPurchase({
        tenantId: payment.cabinet_id,
        paymentId: payment.id,
        credits: (Number(payment.ai_credits ?? 0) * amount) / paid,
      });
    }
    await this.events.record({
      cabinetId: payment.cabinet_id,
      subscriptionId: payment.subscription_id,
      type: 'payment_refunded',
      actor,
      payload: { payment_id: payment.id, amount, total_refunded: payment.refund_amount, reason: input.reason, provider: providerMessage, kind: payment.kind ?? 'subscription' },
    });
    return payment;
  }

  /**
   * Annule une échéance due (geste commercial, erreur de facturation). Si
   * l'abonnement attendait ce paiement, il est activé sans encaissement.
   */
  async waivePaymentByPlatform(paymentId: number, actor: SubscriptionActor, reason: string) {
    const payment = await this.requirePayment(paymentId);
    if (!['pending', 'awaiting_validation'].includes(payment.status)) {
      throw new BadRequestException('Seule une échéance due peut être annulée.');
    }
    payment.status = 'cancelled';
    payment.notes = `Échéance annulée : ${reason}`.slice(0, 500);
    await this.payRepo.save(payment);
    // Un achat de crédits IA annulé ne débloque jamais l'abonnement.
    const sub =
      payment.kind === 'ai_credits'
        ? null
        : await this.subRepo.findOne({ where: { id: payment.subscription_id } });
    if (sub && sub.status === 'pending_payment') {
      sub.status = sub.is_trial ? 'trial' : 'active';
      await this.subRepo.save(sub);
      await this.syncCabinet(sub.cabinet_id, sub);
    }
    await this.events.record({
      cabinetId: payment.cabinet_id,
      subscriptionId: payment.subscription_id,
      type: 'payment_waived',
      actor,
      payload: { payment_id: payment.id, amount: Number(payment.amount), reason },
    });
    return payment;
  }

  /**
   * Filet de sécurité : relit toutes les 10 min les paiements en ligne restés
   * « en attente » (webhook perdu). Au-delà du délai d'expiration configuré,
   * la session de paiement est abandonnée (l'échéance reste due).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcilePendingGatewayPayments(): Promise<void> {
    const expiryHours = await this.pendingExpiryHours();
    const now = Date.now();
    const candidates = await this.payRepo
      .createQueryBuilder('p')
      .where("p.status = 'pending'")
      .andWhere("p.provider IN ('cinetpay','notchpay','stripe')")
      .andWhere('p.reference IS NOT NULL')
      .andWhere('p.updated_at < :recent', { recent: new Date(now - 10 * 60_000) })
      .getMany();
    for (const payment of candidates) {
      try {
        const status = await this.reconcilePayment(payment);
        const age = now - new Date(payment.updated_at).getTime();
        if (status === 'pending' && age > expiryHours * 3_600_000 && payment.checkout_url) {
          await this.payRepo.update(payment.id, {
            checkout_url: null,
            failure_reason: 'Session de paiement expirée',
          });
        }
      } catch (error) {
        this.logger.warn(
          `[Paiement] rapprochement #${payment.id} impossible : ${(error as Error).message}`,
        );
      }
    }
  }

  private async pendingExpiryHours(): Promise<number> {
    try {
      const rows: Array<{ value: any }> = await this.dataSource.query(
        "SELECT value FROM platform_settings WHERE `key` = 'billing' LIMIT 1",
      );
      const raw = rows[0]?.value;
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const hours = Number(value?.pending_payment_expiry_hours);
      return Number.isFinite(hours) && hours > 0 ? hours : 24;
    } catch {
      return 24;
    }
  }

  /**
   * Confirme un encaissement : marque l'échéance payée, active l'abonnement
   * (pending_payment → active) et réactive le cabinet. Idempotent.
   * L'achat d'un pack de crédits IA (`kind = 'ai_credits'`) crédite seulement
   * le ledger du cabinet : l'abonnement n'est jamais modifié.
   */
  async confirmPayment(
    payment: SubscriptionPayment,
    actor: SubscriptionActor = SYSTEM_ACTOR,
  ): Promise<Subscription | null> {
    if (payment.status !== 'paid') {
      payment.status = 'paid';
      payment.paid_at = new Date();
      payment.method = payment.method ?? payment.provider ?? 'manual';
      await this.payRepo.save(payment);
      payment.receipt_number = await this.receipts
        .assignNumber(payment.id)
        .catch((error) => {
          this.logger.warn(`[Reçu] numérotation #${payment.id} impossible : ${error?.message ?? error}`);
          return null;
        });
      await this.events.record({
        cabinetId: payment.cabinet_id,
        subscriptionId: payment.subscription_id,
        type: 'payment_paid',
        actor,
        payload: {
          payment_id: payment.id,
          amount: Number(payment.amount),
          currency: payment.currency,
          method: payment.method,
          provider: payment.provider,
          reference: payment.reference,
          kind: payment.kind ?? 'subscription',
        },
      });
    }

    if (payment.kind === 'ai_credits') {
      // Hors du bloc « premier passage » : une relance (webhook rejoué, plantage
      // entre l'encaissement et le crédit) crédite encore, une seule fois grâce
      // à la clé unique `payment_id` du ledger.
      const credited = await this.aiCredits.creditPurchase({
        tenantId: payment.cabinet_id,
        paymentId: payment.id,
        credits: Number(payment.ai_credits ?? 0),
      });
      if (credited) {
        this.logger.log(
          `[AiCredits] Paiement #${payment.id} confirmé — cabinet=${payment.cabinet_id} +${Number(payment.ai_credits)} crédits`,
        );
      }
      return null;
    }

    const sub = await this.subRepo.findOne({
      where: { id: payment.subscription_id },
    });
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

  /**
   * [TEST] Simule un encaissement réussi pour une échéance du cabinet.
   * Disponible uniquement avec la passerelle de test.
   */
  async simulatePayment(
    cabinetId: number,
    paymentId?: number,
  ): Promise<CurrentSubscription> {
    if (!isPaymentTestEnabled()) {
      throw new ForbiddenException(
        'Simulation indisponible : passerelle réelle active',
      );
    }
    const where = paymentId
      ? { id: paymentId, cabinet_id: cabinetId }
      : undefined;
    const payment = where
      ? await this.payRepo.findOne({ where })
      : await this.payRepo.findOne({
          where: { cabinet_id: cabinetId, kind: 'subscription', status: 'pending' },
          order: { id: 'DESC' },
        });
    if (!payment) throw new NotFoundException('Aucune échéance à régler');
    payment.method = payment.method ?? 'test';
    payment.provider = payment.provider ?? 'test';
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
      await this.events.record({
        cabinetId: sub.cabinet_id,
        subscriptionId: sub.id,
        type: 'trial_ended',
        payload: { ends_at: sub.ends_at },
      });
      this.logger.log(
        `[Subscriptions] Essai terminé — cabinet=${sub.cabinet_id} → période payante ` +
          `(ends_at=${sub.ends_at?.toISOString() ?? 'illimité'})`,
      );
    }

    // ── Phase 2 : fin de la période payante → suspension ──────────────────────
    if (!sub.ends_at) return sub; // illimité
    if (new Date(sub.ends_at).getTime() > now) return sub; // pas encore échu
    if (
      sub.status === 'expired' ||
      sub.status === 'suspended' ||
      sub.status === 'cancelled'
    ) {
      return sub;
    }

    // Échéance atteinte → pas de paiement réel pour l'instant : on suspend.
    // (Le renouvellement automatique reste possible si activé explicitement et
    //  qu'un paiement existera un jour ; aujourd'hui on applique la suspension.)
    sub.status = 'suspended';
    await this.subRepo.save(sub);
    await this.suspendCabinet(sub.cabinet_id, 'expired');
    await this.events.record({
      cabinetId: sub.cabinet_id,
      subscriptionId: sub.id,
      type: 'expired',
      payload: { ends_at: sub.ends_at },
    });
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
    this.logger.log(
      `[Subscriptions] ${due.length} abonnement(s) à traiter (essai/échéance)…`,
    );
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

    this.logger.warn(
      `[Cleanup] ${stale.length} cabinet(s) non payé(s) à purger (> ${days} j)`,
    );
    for (const sub of stale) {
      try {
        await this.purgeUnpaidCabinet(sub.cabinet_id);
      } catch (e: any) {
        this.logger.error(
          `[Cleanup] échec cabinet=${sub.cabinet_id}: ${e?.message ?? e}`,
        );
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
    const paid = await this.payRepo.count({
      where: { cabinet_id: cabinetId, status: 'paid' },
    });
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
          await m.query(`DELETE FROM \`${t}\` WHERE tenant_id = ?`, [
            cabinetId,
          ]);
        }
        if (empIds.length) {
          await m.query('DELETE FROM `user` WHERE id IN (?)', [empIds]);
        }
        await m.query(
          'DELETE FROM subscription_payments WHERE cabinet_id = ?',
          [cabinetId],
        );
        await m.query('DELETE FROM subscriptions WHERE cabinet_id = ?', [
          cabinetId,
        ]);
        await m.query('DELETE FROM cabinets WHERE id = ?', [cabinetId]);
      } finally {
        await m.query('SET FOREIGN_KEY_CHECKS=1');
      }
    });
    this.logger.warn(`[Cleanup] cabinet non payé supprimé: ${cabinetId}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Clôt les abonnements vivants d'un cabinet et annule leurs échéances dues. */
  private async closeLiveSubscriptions(
    cabinetId: number,
    statuses: Subscription['status'][],
    reason: string,
  ): Promise<void> {
    const live = await this.subRepo.find({
      where: { cabinet_id: cabinetId, status: In(statuses) },
      select: ['id'],
    });
    if (!live.length) return;
    const ids = live.map((s) => s.id);
    await this.subRepo.update(
      { id: In(ids) },
      { status: 'cancelled', cancelled_at: new Date(), cancel_reason: reason },
    );
    await this.payRepo.update(
      { subscription_id: In(ids), kind: 'subscription', status: In(['pending', 'awaiting_validation']) },
      { status: 'cancelled', notes: `Échéance d'un abonnement ${reason === 'renewed' ? 'renouvelé' : 'remplacé'}` },
    );
  }

  private async createPaymentForPeriod(
    sub: Subscription,
    amount: number,
    periodStart: Date,
    periodEnd: Date | null,
    quote: CouponQuote | null = null,
  ): Promise<SubscriptionPayment> {
    const discounted = !!quote && quote.discount > 0;
    // Échéance entièrement couverte par le code promo : réglée d'office.
    const covered = discounted && quote!.net <= 0 && Number(amount) > 0;
    const payment = this.payRepo.create({
      subscription_id: sub.id,
      cabinet_id: sub.cabinet_id,
      amount: discounted ? quote!.net : amount,
      amount_gross: discounted ? Number(amount) : null,
      discount_amount: discounted ? quote!.discount : 0,
      currency: sub.currency,
      status: covered ? 'paid' : 'pending',
      due_date: periodStart,
      paid_at: covered ? new Date() : null,
      period_start: periodStart,
      period_end: periodEnd,
      method: covered ? 'coupon' : null,
      reference: null,
    });
    return this.payRepo.save(payment);
  }

  /** Applique un code promo à une période (mois offerts) et chiffre la remise. */
  private async applyQuote(
    coupon: CouponQuote['coupon'],
    period: { amount: number; ends_at: Date | null; trial_ends_at: Date | null; is_trial: boolean },
    currency: string,
    startedAt: Date,
  ): Promise<CouponQuote> {
    const res = computeDiscount(coupon, Number(period.amount), currency);
    if (res.free_months > 0 && period.ends_at) {
      period.ends_at = addMonths(new Date(period.ends_at), res.free_months);
    }
    void startedAt;
    await this.coupons.reserve(coupon);
    return { coupon, gross: Number(period.amount), ...res };
  }

  private async recordCoupon(
    quote: CouponQuote,
    sub: Subscription,
    paymentId: number,
    actor: SubscriptionActor,
    carried = false,
  ) {
    await this.coupons.record({
      couponId: quote.coupon.id,
      cabinetId: sub.cabinet_id,
      subscriptionId: sub.id,
      paymentId,
      discount: quote.discount,
      freeMonths: quote.free_months,
    });
    await this.events.record({
      cabinetId: sub.cabinet_id,
      subscriptionId: sub.id,
      type: 'coupon_applied',
      actor,
      payload: {
        code: quote.coupon.code,
        type: quote.coupon.type,
        discount: quote.discount,
        free_months: quote.free_months,
        net: quote.net,
        carried,
      },
    });
  }

  /**
   * Code promo saisi par le cabinet (ou appliqué par la plateforme) sur
   * l'échéance due de l'abonnement courant, avant paiement.
   */
  async applyCouponToDuePayment(cabinetId: number, code: string, actor: SubscriptionActor) {
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    const payment = await this.payRepo.findOne({
      where: { subscription_id: sub.id, kind: 'subscription', status: 'pending' },
      order: { id: 'DESC' },
    });
    if (!payment || Number(payment.amount) <= 0) {
      throw new BadRequestException('Aucune échéance à régler.');
    }
    if (Number(payment.discount_amount ?? 0) > 0 || sub.coupon_id) {
      throw new BadRequestException('Un code promo est déjà appliqué à cette échéance.');
    }
    const coupon = await this.coupons.check(code, { cabinetId, planId: sub.plan_id, cycle: sub.billing_cycle });
    const gross = Number(payment.amount);
    const res = computeDiscount(coupon, gross, payment.currency);
    await this.coupons.reserve(coupon);
    if (res.discount > 0) {
      payment.amount_gross = gross;
      payment.discount_amount = res.discount;
      payment.amount = res.net;
    }
    if (res.free_months > 0) {
      if (sub.ends_at) sub.ends_at = addMonths(new Date(sub.ends_at), res.free_months);
      if (payment.period_end) payment.period_end = addMonths(new Date(payment.period_end), res.free_months);
    }
    // Lien de checkout éventuel devenu caduc (montant modifié).
    payment.checkout_url = null;
    payment.reference = null;
    payment.provider_reference = null;
    sub.coupon_id = coupon.id;
    sub.discount_cycles_remaining = Math.max(0, (coupon.duration_cycles ?? 1) - 1);
    await this.subRepo.save(sub);
    const covered = res.discount > 0 && res.net <= 0;
    if (covered) {
      payment.status = 'paid';
      payment.paid_at = new Date();
      payment.method = 'coupon';
    }
    await this.payRepo.save(payment);
    await this.recordCoupon({ coupon, gross, ...res }, sub, payment.id, actor);
    if (covered && sub.status === 'pending_payment') {
      sub.status = sub.is_trial ? 'trial' : 'active';
      await this.subRepo.save(sub);
      await this.syncCabinet(cabinetId, sub);
    }
    return this.getCurrent(cabinetId);
  }

  /**
   * Aligne le cabinet (status + trial_ends_at + plan) sur l'abonnement courant.
   * Une suspension MANUELLE (décision plateforme) n'est jamais levée ici :
   * seule la réactivation plateforme la lève.
   */
  private async syncCabinet(
    cabinetId: number,
    sub: Subscription,
  ): Promise<void> {
    const cabinet = await this.cabinetRepo.findOne({
      where: { id: cabinetId },
    });
    if (!cabinet) return;
    cabinet.trial_ends_at = sub.is_trial ? sub.trial_ends_at : null;
    cabinet.plan_id = sub.plan_id || cabinet.plan_id;
    if (!isManuallySuspended(cabinet)) {
      cabinet.status = sub.is_trial ? 'trial' : 'active';
      clearSuspension(cabinet);
    }
    await this.cabinetRepo.save(cabinet);
    this.appEvents?.emit('ai.config.changed', { tenantId: cabinetId });
  }

  private async suspendCabinet(
    cabinetId: number,
    reason: CabinetSuspensionReason,
  ): Promise<void> {
    const cabinet = await this.cabinetRepo.findOne({
      where: { id: cabinetId },
    });
    if (!cabinet) return;
    if (cabinet.status === 'suspended' && cabinet.suspension_reason) return;
    this.markSuspended(cabinet, reason);
    await this.cabinetRepo.save(cabinet);
  }

  /** Pose la suspension sans écraser une suspension manuelle existante. */
  private markSuspended(cabinet: Cabinet, reason: CabinetSuspensionReason) {
    if (isManuallySuspended(cabinet) && reason !== 'manual') return;
    cabinet.status = 'suspended';
    cabinet.suspension_reason = reason;
    cabinet.suspended_at = new Date();
    if (reason !== 'manual') {
      cabinet.suspended_by_admin_id = null;
      cabinet.suspension_note = null;
    }
  }

  private async resolveCurrency(cabinetId: number): Promise<string> {
    const cabinet = await this.cabinetRepo.findOne({
      where: { id: cabinetId },
    });
    return cabinet?.currency ?? 'XAF';
  }

  // ── Actions plateforme (super admin) ───────────────────────────────────────

  /** Abonnement courant (non annulé) ou null — lecture plateforme. */
  findCurrent(cabinetId: number): Promise<Subscription | null> {
    return this.getRawCurrent(cabinetId);
  }

  private async requireCabinet(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: cabinetId } });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');
    return cabinet;
  }

  /** Suspension manuelle : jamais levée automatiquement (paiement, renouvellement…). */
  async suspendByPlatform(
    cabinetId: number,
    actor: SubscriptionActor,
    note: string,
  ): Promise<Cabinet> {
    const cabinet = await this.requireCabinet(cabinetId);
    this.markSuspended(cabinet, 'manual');
    cabinet.suspended_by_admin_id = actor.id ?? null;
    cabinet.suspension_note = note?.slice(0, 500) || null;
    await this.cabinetRepo.save(cabinet);
    const sub = await this.getRawCurrent(cabinetId);
    await this.events.record({
      cabinetId,
      subscriptionId: sub?.id ?? null,
      type: 'suspended',
      actor,
      payload: { reason: 'manual', note },
    });
    return cabinet;
  }

  /**
   * Lève une suspension manuelle puis réaligne le cabinet sur son abonnement :
   * il reste suspendu si l'abonnement est échu ou en attente de paiement.
   */
  async reactivateByPlatform(
    cabinetId: number,
    actor: SubscriptionActor,
  ): Promise<{ cabinet: Cabinet; still_suspended_reason: string | null }> {
    const cabinet = await this.requireCabinet(cabinetId);
    const wasManual = isManuallySuspended(cabinet);
    clearSuspension(cabinet);
    cabinet.status = 'active';
    await this.cabinetRepo.save(cabinet);

    let sub = await this.getRawCurrent(cabinetId);
    if (sub) sub = await this.expireIfDue(sub);
    let reason: CabinetSuspensionReason | null = null;
    if (!sub) {
      reason = null;
    } else if (sub.status === 'pending_payment') {
      reason = 'payment_required';
    } else if (sub.status === 'suspended' || sub.status === 'expired') {
      reason = 'expired';
    }
    if (reason) {
      await this.suspendCabinet(cabinetId, reason);
    } else if (sub) {
      await this.syncCabinet(cabinetId, sub);
    }
    await this.events.record({
      cabinetId,
      subscriptionId: sub?.id ?? null,
      type: 'reactivated',
      actor,
      payload: { lifted_manual: wasManual, still_suspended_reason: reason },
    });
    return {
      cabinet: await this.requireCabinet(cabinetId),
      still_suspended_reason: reason,
    };
  }

  /**
   * Prolonge l'abonnement courant de `days` jours (ou jusqu'à `until`).
   * Pendant un essai, l'essai ET la période payante sont décalés.
   * Un abonnement échu/suspendu repart (active / trial).
   */
  async extendByPlatform(
    cabinetId: number,
    input: { days?: number; until?: string | Date },
    actor: SubscriptionActor,
    note?: string,
    eventType: SubscriptionEventType = 'extended',
  ): Promise<Subscription> {
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    if (sub.status === 'pending_payment') {
      throw new BadRequestException(
        "Paiement en attente : enregistrez le paiement ou changez le plan sans facturation avant de prolonger.",
      );
    }
    const now = new Date();
    const base =
      sub.ends_at && new Date(sub.ends_at).getTime() > now.getTime()
        ? new Date(sub.ends_at)
        : now;
    let newEnds: Date;
    if (input.until) {
      newEnds = new Date(input.until);
      if (Number.isNaN(newEnds.getTime()) || newEnds.getTime() <= now.getTime()) {
        throw new BadRequestException('La nouvelle date de fin doit être dans le futur.');
      }
    } else {
      const days = Math.round(Number(input.days ?? 0));
      if (!days || days < 1 || days > 3660) {
        throw new BadRequestException('Nombre de jours invalide (1 à 3660).');
      }
      newEnds = addDays(base, days);
    }
    const before = {
      status: sub.status,
      ends_at: sub.ends_at,
      trial_ends_at: sub.trial_ends_at,
    };
    const shiftMs =
      newEnds.getTime() - (sub.ends_at ? new Date(sub.ends_at).getTime() : now.getTime());
    if (sub.is_trial && sub.trial_ends_at && shiftMs > 0) {
      const trialBase = Math.max(new Date(sub.trial_ends_at).getTime(), now.getTime());
      sub.trial_ends_at = new Date(trialBase + shiftMs);
    }
    sub.ends_at = newEnds;
    if (sub.status === 'suspended' || sub.status === 'expired') {
      sub.status =
        sub.is_trial && sub.trial_ends_at && new Date(sub.trial_ends_at) > now
          ? 'trial'
          : 'active';
    }
    const saved = await this.subRepo.save(sub);
    await this.syncCabinet(cabinetId, saved);
    await this.events.record({
      cabinetId,
      subscriptionId: saved.id,
      type: eventType,
      actor,
      payload: {
        before,
        after: { status: saved.status, ends_at: saved.ends_at, trial_ends_at: saved.trial_ends_at },
        note: note ?? null,
      },
    });
    return saved;
  }

  /** Offre `months` mois gratuits (prolongation sans facturation). */
  async grantFreePeriodByPlatform(
    cabinetId: number,
    months: number,
    actor: SubscriptionActor,
    note?: string,
  ): Promise<Subscription> {
    const m = Math.round(Number(months));
    if (!m || m < 1 || m > 36) {
      throw new BadRequestException('Nombre de mois invalide (1 à 36).');
    }
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    const now = new Date();
    const base =
      sub.ends_at && new Date(sub.ends_at) > now ? new Date(sub.ends_at) : now;
    return this.extendByPlatform(
      cabinetId,
      { until: addMonths(base, m) },
      actor,
      note,
      'free_period_granted',
    );
  }

  /**
   * Changement de plan par la plateforme :
   *  - `keep_period` : plan/cycle modifiés sur la période en cours, sans
   *    facturation ; le nouveau tarif s'applique au prochain renouvellement ;
   *  - `new_period`  : nouvelle période facturée (même règle que le
   *    self-service : paiement exigé avant activation pour un plan payant).
   */
  async changePlanByPlatform(
    cabinetId: number,
    input: { planId: number; cycle?: BillingCycle; mode: 'keep_period' | 'new_period' },
    actor: SubscriptionActor,
  ): Promise<Subscription> {
    const plan = await this.planRepo.findOne({ where: { id: input.planId } });
    if (!plan) throw new NotFoundException('Plan introuvable');
    const current = await this.getRawCurrent(cabinetId);
    const cycle = input.cycle ?? current?.billing_cycle ?? 'monthly';

    if (input.mode === 'new_period' || !current) {
      return this.createForCabinet(cabinetId, plan.id, cycle, {
        actor,
        eventType: current ? 'plan_changed' : 'created',
        eventPayload: { from_plan_id: current?.plan_id ?? null, mode: 'new_period' },
      });
    }

    const before = {
      plan_id: current.plan_id,
      cycle: current.billing_cycle,
      amount: Number(current.amount),
    };
    current.plan_id = plan.id;
    current.plan = plan;
    current.billing_cycle = cycle;
    current.amount = planPriceForCycle(plan, cycle);
    const saved = await this.subRepo.save(current);
    const pending = await this.payRepo.findOne({
      where: { subscription_id: saved.id, kind: 'subscription', status: 'pending' },
      order: { id: 'DESC' },
    });
    if (pending) {
      pending.amount = saved.amount;
      await this.payRepo.save(pending);
    }
    await this.syncCabinet(cabinetId, saved);
    await this.events.record({
      cabinetId,
      subscriptionId: saved.id,
      type: 'plan_changed',
      actor,
      payload: {
        mode: 'keep_period',
        from_plan_id: before.plan_id,
        plan_id: plan.id,
        before,
        after: { plan_id: plan.id, cycle, amount: Number(saved.amount) },
      },
    });
    return saved;
  }

  /**
   * Résiliation par la plateforme :
   *  - `immediate` : abonnement annulé et cabinet suspendu (manuel) ;
   *  - sinon : pas de reconduction, l'accès court jusqu'à la fin de période.
   */
  async cancelByPlatform(
    cabinetId: number,
    input: { reason: string; immediate: boolean },
    actor: SubscriptionActor,
  ): Promise<Subscription> {
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');
    sub.auto_renew = false;
    sub.cancel_reason = input.reason?.slice(0, 255) || null;
    if (input.immediate) {
      sub.status = 'cancelled';
      sub.cancelled_at = new Date();
    }
    const saved = await this.subRepo.save(sub);
    if (input.immediate) {
      const cabinet = await this.requireCabinet(cabinetId);
      this.markSuspended(cabinet, 'manual');
      cabinet.suspended_by_admin_id = actor.id ?? null;
      cabinet.suspension_note = `Abonnement résilié : ${input.reason}`.slice(0, 500);
      await this.cabinetRepo.save(cabinet);
    }
    await this.events.record({
      cabinetId,
      subscriptionId: saved.id,
      type: 'cancelled',
      actor,
      payload: { reason: input.reason, immediate: input.immediate, ends_at: saved.ends_at },
    });
    return saved;
  }

  listEvents(cabinetId: number) {
    return this.events.listForCabinet(cabinetId);
  }

  // ── Outils DEV (indisponibles en production) ───────────────────────────────

  private assertDev(): void {
    if (!isPaymentTestEnabled()) {
      throw new ForbiddenException(
        'Outils de développement indisponibles en production',
      );
    }
  }

  /**
   * Force la date de fin de l'abonnement courant à `now + days` (days négatif
   * = passé). Permet de tester la bannière « expire bientôt » / l'expiration.
   */
  async devSetEndsIn(
    cabinetId: number,
    days: number,
  ): Promise<CurrentSubscription> {
    this.assertDev();
    const sub = await this.getRawCurrent(cabinetId);
    if (!sub) throw new NotFoundException('Aucun abonnement pour ce cabinet');

    const ends = new Date();
    ends.setDate(ends.getDate() + days);
    sub.ends_at = ends;
    await this.subRepo.save(sub);

    const lastPayment = await this.payRepo.findOne({
      where: { subscription_id: sub.id, kind: 'subscription' },
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
      throw new ForbiddenException(
        "L'abonnement courant n'est pas en période d'essai",
      );
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
