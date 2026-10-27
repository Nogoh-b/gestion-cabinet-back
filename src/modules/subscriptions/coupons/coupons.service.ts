import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Coupon, CouponCycle, CouponRedemption, CouponType } from './coupon.entity';

export interface CouponQuote {
  coupon: Coupon;
  gross: number;
  discount: number;
  net: number;
  free_months: number;
}

export interface CouponInput {
  code?: string;
  description?: string | null;
  type?: CouponType;
  value?: number;
  plan_ids?: number[] | null;
  cycle?: CouponCycle;
  duration_cycles?: number | null;
  max_redemptions?: number | null;
  max_per_cabinet?: number;
  valid_from?: string | null;
  valid_until?: string | null;
}

export function normalizeCode(code: string): string {
  return String(code ?? '').trim().toUpperCase();
}

/**
 * Calcule la remise d'un coupon sur un montant. En XAF/XOF le net est arrondi
 * au multiple de 5 inférieur (contrainte des passerelles Mobile Money).
 */
export function computeDiscount(
  coupon: Pick<Coupon, 'type' | 'value'>,
  amount: number,
  currency = 'XAF',
): { discount: number; net: number; free_months: number } {
  const gross = Math.max(0, Number(amount) || 0);
  if (coupon.type === 'free_months') {
    return { discount: 0, net: gross, free_months: Math.max(0, Math.round(Number(coupon.value))) };
  }
  let discount =
    coupon.type === 'percent'
      ? (gross * Math.min(100, Math.max(0, Number(coupon.value)))) / 100
      : Math.min(gross, Math.max(0, Number(coupon.value)));
  let net = gross - discount;
  if (['XAF', 'XOF'].includes(currency.toUpperCase())) {
    net = Math.max(0, Math.floor(net / 5) * 5);
  } else {
    net = Math.max(0, Math.round(net * 100) / 100);
  }
  discount = Math.round((gross - net) * 100) / 100;
  return { discount, net, free_months: 0 };
}

/** Codes promo : éligibilité, calcul, utilisation (quota atomique), gestion. */
@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon) private readonly coupons: Repository<Coupon>,
    @InjectRepository(CouponRedemption)
    private readonly redemptions: Repository<CouponRedemption>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** Vérifie qu'un code est utilisable dans ce contexte (lève sinon). */
  async check(
    code: string,
    ctx: { cabinetId?: number | null; planId?: number | null; cycle?: string | null },
  ): Promise<Coupon> {
    const coupon = await this.coupons.findOne({ where: { code: normalizeCode(code) } });
    if (!coupon || !coupon.is_active) throw new BadRequestException('Code promo invalide.');
    const now = Date.now();
    if (coupon.valid_from && new Date(coupon.valid_from).getTime() > now) {
      throw new BadRequestException("Ce code promo n'est pas encore valable.");
    }
    if (coupon.valid_until && new Date(coupon.valid_until).getTime() < now) {
      throw new BadRequestException('Ce code promo a expiré.');
    }
    if (coupon.max_redemptions !== null && coupon.redeemed_count >= coupon.max_redemptions) {
      throw new BadRequestException("Ce code promo n'est plus disponible.");
    }
    if (coupon.plan_ids?.length && ctx.planId && !coupon.plan_ids.includes(Number(ctx.planId))) {
      throw new BadRequestException("Ce code promo ne s'applique pas à ce plan.");
    }
    if (coupon.cycle !== 'any' && ctx.cycle && coupon.cycle !== ctx.cycle) {
      throw new BadRequestException(
        `Ce code promo est réservé aux abonnements ${coupon.cycle === 'yearly' ? 'annuels' : 'mensuels'}.`,
      );
    }
    if (ctx.cabinetId) {
      const used = await this.redemptions.count({
        where: { coupon_id: coupon.id, cabinet_id: ctx.cabinetId },
      });
      if (used >= Math.max(1, coupon.max_per_cabinet)) {
        throw new BadRequestException('Vous avez déjà utilisé ce code promo.');
      }
    }
    return coupon;
  }

  async quote(
    code: string,
    ctx: { cabinetId?: number | null; planId?: number | null; cycle?: string | null; amount: number; currency?: string },
  ): Promise<CouponQuote> {
    const coupon = await this.check(code, ctx);
    const res = computeDiscount(coupon, ctx.amount, ctx.currency ?? 'XAF');
    return { coupon, gross: Number(ctx.amount), ...res };
  }

  /**
   * Réserve une utilisation : le compteur global est incrémenté de façon
   * atomique (aucun dépassement de quota, même en concurrence).
   */
  async reserve(coupon: Coupon): Promise<void> {
    const res = await this.db.query(
      `UPDATE platform_coupons SET redeemed_count = redeemed_count + 1
        WHERE id = ? AND is_active = 1
          AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)`,
      [coupon.id],
    );
    if (!Number(res?.affectedRows ?? 0)) {
      throw new ConflictException("Ce code promo n'est plus disponible.");
    }
  }

  /** Trace une utilisation (abonnement / échéance remisés). */
  async record(data: {
    couponId: number;
    cabinetId: number;
    subscriptionId?: number | null;
    paymentId?: number | null;
    discount: number;
    freeMonths: number;
  }): Promise<void> {
    await this.redemptions.insert({
      coupon_id: data.couponId,
      cabinet_id: data.cabinetId,
      subscription_id: data.subscriptionId ?? null,
      payment_id: data.paymentId ?? null,
      discount_amount: data.discount,
      free_months: data.freeMonths,
    });
  }

  /** Utilisation sur une échéance de renouvellement (coupon multi-échéances). */
  async findById(id: number | null | undefined) {
    return id ? this.coupons.findOne({ where: { id } }) : null;
  }

  // ── Gestion (plateforme) ────────────────────────────────────────────────────

  async list() {
    const rows = await this.coupons.find({ order: { created_at: 'DESC' } });
    const stats: Array<{ coupon_id: number; n: string; total: string; cabinets: string }> =
      await this.db.query(
        `SELECT coupon_id, COUNT(*) AS n, COALESCE(SUM(discount_amount), 0) AS total,
                COUNT(DISTINCT cabinet_id) AS cabinets
           FROM coupon_redemptions GROUP BY coupon_id`,
      );
    const byId = new Map(stats.map((s) => [Number(s.coupon_id), s]));
    return rows.map((c) => ({
      ...c,
      value: Number(c.value),
      redemptions: Number(byId.get(c.id)?.n ?? 0),
      total_discount: Number(byId.get(c.id)?.total ?? 0),
      cabinets: Number(byId.get(c.id)?.cabinets ?? 0),
    }));
  }

  async redemptionsOf(couponId: number) {
    return this.db.query(
      `SELECT r.*, c.name AS cabinet_name
         FROM coupon_redemptions r JOIN cabinets c ON c.id = r.cabinet_id
        WHERE r.coupon_id = ? ORDER BY r.created_at DESC LIMIT 500`,
      [couponId],
    );
  }

  async create(input: CouponInput, adminId: number) {
    const code = normalizeCode(input.code ?? '');
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      throw new BadRequestException('Code : 3 à 40 caractères (lettres, chiffres, - ou _).');
    }
    if (await this.coupons.findOne({ where: { code } })) {
      throw new ConflictException('Ce code existe déjà.');
    }
    const coupon = this.coupons.create({
      code,
      is_active: true,
      redeemed_count: 0,
      created_by_admin_id: adminId,
      ...this.clean(input, true),
    });
    return this.coupons.save(coupon);
  }

  async update(id: number, input: CouponInput) {
    const coupon = await this.coupons.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Code promo introuvable.');
    const before = { ...coupon };
    Object.assign(coupon, this.clean(input, false));
    return { before, after: await this.coupons.save(coupon) };
  }

  async setActive(id: number, active: boolean) {
    const coupon = await this.coupons.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Code promo introuvable.');
    coupon.is_active = active;
    return this.coupons.save(coupon);
  }

  private clean(input: CouponInput, creating: boolean): Partial<Coupon> {
    const out: Partial<Coupon> = {};
    if (input.description !== undefined) out.description = input.description?.slice(0, 255) || null;
    if (input.type !== undefined || creating) {
      if (!['percent', 'fixed', 'free_months'].includes(String(input.type))) {
        throw new BadRequestException('Type de remise invalide.');
      }
      out.type = input.type as CouponType;
    }
    if (input.value !== undefined || creating) {
      const value = Number(input.value);
      const type = out.type ?? input.type;
      if (!(value > 0)) throw new BadRequestException('La valeur doit être positive.');
      if (type === 'percent' && value > 100) throw new BadRequestException('Un pourcentage ne peut dépasser 100.');
      if (type === 'free_months' && (!Number.isInteger(value) || value > 24)) {
        throw new BadRequestException('Mois offerts : nombre entier de 1 à 24.');
      }
      out.value = value;
    }
    if (input.plan_ids !== undefined) {
      const ids = (input.plan_ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      out.plan_ids = ids.length ? ids : null;
    }
    if (input.cycle !== undefined) {
      if (!['any', 'monthly', 'yearly'].includes(input.cycle)) throw new BadRequestException('Cycle invalide.');
      out.cycle = input.cycle;
    }
    if (input.duration_cycles !== undefined) {
      out.duration_cycles = input.duration_cycles ? Math.max(1, Math.round(Number(input.duration_cycles))) : null;
    }
    if (input.max_redemptions !== undefined) {
      out.max_redemptions = input.max_redemptions ? Math.max(1, Math.round(Number(input.max_redemptions))) : null;
    }
    if (input.max_per_cabinet !== undefined) {
      out.max_per_cabinet = Math.max(1, Math.round(Number(input.max_per_cabinet) || 1));
    }
    const date = (v: string | null | undefined) => {
      if (!v) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Date invalide.');
      return d;
    };
    if (input.valid_from !== undefined) out.valid_from = date(input.valid_from);
    if (input.valid_until !== undefined) out.valid_until = date(input.valid_until);
    return out;
  }
}
