/**
 * Crédits IA : conversion coût → crédits, dépassement du forfait sur les
 * crédits achetés, épuisement, pourcentages (jamais de chiffres pour le
 * cabinet) et règlement mensuel idempotent.
 */
import { describe, expect, it, jest } from '@jest/globals';

import { PlanQuotaService } from '../plan-quota.service';
import {
  creditPosition,
  overflowToCharge,
  packPlanPct,
  parseCreditSettings,
  previousPeriod,
  publicStatus,
  toCredits,
  toUsd,
} from './ai-credits';
import { AiCreditsService } from './ai-credits.service';

describe('conversion coût → crédits', () => {
  it('1 crédit = usd_per_credit USD de coût fournisseur', () => {
    // 6 000 tokens d'entrée à 0,15 $/M + 800 de sortie à 0,60 $/M = 0,00138 $
    const cost = (6000 * 0.15 + 800 * 0.6) / 1_000_000;
    expect(cost).toBeCloseTo(0.00138, 8);
    expect(toCredits(cost, 0.001)).toBeCloseTo(1.38, 4);
    expect(toCredits(cost, 0.0005)).toBeCloseTo(2.76, 4);
    expect(toUsd(1.38, 0.001)).toBeCloseTo(0.00138, 6);
  });

  it('un appel sans coût (modèle non tarifé) ne consomme rien', () => {
    expect(toCredits(null, 0.001)).toBe(0);
    expect(toCredits('0', 0.001)).toBe(0);
    expect(toCredits(0.5, 0)).toBe(0);
  });

  it('réglage absent ou invalide : 0,001 $ par crédit', () => {
    expect(parseCreditSettings(undefined).usd_per_credit).toBe(0.001);
    expect(parseCreditSettings('{"usd_per_credit":"abc"}').usd_per_credit).toBe(0.001);
    expect(parseCreditSettings('{"usd_per_credit":0.002}').usd_per_credit).toBe(0.002);
    expect(parseCreditSettings({ usd_per_credit: -1 }).usd_per_credit).toBe(0.001);
  });
});

describe('position et pourcentages', () => {
  const position = (used: number, balance = 0, granted = balance, allowance: number | null = 1000) =>
    creditPosition({ allowance, used, balance, granted });

  it('sous le forfait : pourcentage du mois, rien d’épuisé', () => {
    const status = publicStatus(position(620), new Date('2026-11-01T00:00:00Z'));
    expect(status).toMatchObject({ monthPct: 62, extraPct: null, exhausted: false, unlimited: false });
    expect(Object.keys(status).sort()).toEqual(['exhausted', 'extraPct', 'monthPct', 'resetsAt', 'unlimited']);
  });

  it('le statut cabinet ne contient aucun nombre de crédits', () => {
    const status = publicStatus(position(1234, 567, 567), new Date('2026-11-01T00:00:00Z'));
    expect(JSON.stringify(status)).not.toMatch(/1234|567/);
  });

  it('dépassement : le surplus est puisé dans les crédits achetés', () => {
    // 1 200 consommés sur 1 000 : 200 de dépassement sur 500 achetés → 300 restants (60 %).
    const p = position(1200, 500, 500);
    expect(p.overflow).toBe(200);
    expect(p.extraLeft).toBe(300);
    expect(p.exhausted).toBe(false);
    expect(publicStatus(p, new Date()).monthPct).toBe(100);
    expect(publicStatus(p, new Date()).extraPct).toBe(60);
  });

  it('épuisement : forfait consommé et plus de crédits achetés', () => {
    expect(position(1000).exhausted).toBe(true);
    expect(position(1500, 500, 500).exhausted).toBe(true);
    expect(position(1499, 500, 500).exhausted).toBe(false);
    expect(position(0, 0, 0, 0).exhausted).toBe(true); // forfait à 0 sans achat
    expect(position(0, 100, 100, 0).exhausted).toBe(false);
  });

  it('forfait illimité (NULL / -1) : jamais épuisé', () => {
    for (const allowance of [null, -1]) {
      const p = position(5_000_000, 0, 0, allowance);
      expect(p.exhausted).toBe(false);
      expect(publicStatus(p, new Date())).toMatchObject({ unlimited: true, monthPct: 0, extraPct: null });
    }
  });

  it('un pack se lit en « ≈ +N % du forfait »', () => {
    expect(packPlanPct(250, 1000)).toBe(25);
    expect(packPlanPct(1, 100000)).toBe(1);
    expect(packPlanPct(250, null)).toBeNull();
    expect(packPlanPct(250, -1)).toBeNull();
  });

  it('le dépassement inscrit ne dépasse jamais les crédits achetés', () => {
    expect(overflowToCharge(200, 500)).toBe(200);
    expect(overflowToCharge(800, 500)).toBe(500);
    expect(overflowToCharge(800, 0)).toBe(0);
    expect(overflowToCharge(800, -50)).toBe(0);
  });
});

interface LedgerRow {
  id: number;
  tenant_id: number;
  kind: string;
  credits: number;
  payment_id?: number | null;
  period?: string | null;
}

/** Base en mémoire : ledger + consommation, avec les clés uniques du schéma. */
function fakeDb(opts: { allowance?: number | null; costs?: Array<{ tenant_id: number; cost: number }> } = {}) {
  const ledger: LedgerRow[] = [];
  const db: any = {
    ledger,
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('platform_settings')) return [{ value: JSON.stringify({ usd_per_credit: 0.001 }) }];
      if (sql.includes('FROM ai_request_calls') && sql.includes('GROUP BY c.tenant_id')) {
        return (opts.costs ?? []).map((row) => ({ ...row, allowance: opts.allowance ?? null }));
      }
      if (sql.includes("kind = 'overflow' AND period")) {
        return ledger
          .filter((r) => r.tenant_id === params[0] && r.kind === 'overflow' && r.period === params[1])
          .slice(0, 1);
      }
      if (sql.includes('AS balance')) {
        const rows = ledger.filter((r) => r.tenant_id === params[0]);
        return [
          {
            balance: rows.reduce((sum, r) => sum + r.credits, 0),
            granted: rows
              .filter((r) => ['purchase', 'grant'].includes(r.kind) && r.credits > 0)
              .reduce((sum, r) => sum + r.credits, 0),
          },
        ];
      }
      if (sql.includes('INSERT IGNORE INTO ai_credit_ledger') && sql.includes("'purchase'")) {
        const [tenant_id, credits, payment_id] = params;
        if (ledger.some((r) => r.payment_id === payment_id)) return { affectedRows: 0 };
        ledger.push({ id: ledger.length + 1, tenant_id, kind: 'purchase', credits, payment_id });
        return { affectedRows: 1 };
      }
      if (sql.includes('INSERT IGNORE INTO ai_credit_ledger') && sql.includes("'overflow'")) {
        const [tenant_id, credits, period] = params;
        if (ledger.some((r) => r.tenant_id === tenant_id && r.kind === 'overflow' && r.period === period)) {
          return { affectedRows: 0 };
        }
        ledger.push({ id: ledger.length + 1, tenant_id, kind: 'overflow', credits, period });
        return { affectedRows: 1 };
      }
      return [];
    }),
  };
  return db;
}

function service(db: any) {
  return new AiCreditsService(db, {} as any, new PlanQuotaService({} as any));
}

describe('AiCreditsService — achats et règlement mensuel', () => {
  it('creditPurchase est idempotent par paiement', async () => {
    const db = fakeDb();
    const credits = service(db);
    expect(await credits.creditPurchase({ tenantId: 25, paymentId: 7, credits: 500 })).toBe(true);
    expect(await credits.creditPurchase({ tenantId: 25, paymentId: 7, credits: 500 })).toBe(false);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0].credits).toBe(500);
  });

  it('settleMonth écrit le dépassement une seule fois, plafonné aux crédits achetés', async () => {
    // 1 800 crédits consommés (1,8 $) sur un forfait de 1 000 → dépassement 800 ;
    // 500 achetés : seuls 500 sont inscrits.
    const db = fakeDb({ allowance: 1000, costs: [{ tenant_id: 25, cost: 1.8 }] });
    db.ledger.push({ id: 1, tenant_id: 25, kind: 'purchase', credits: 500, payment_id: 1 });
    const credits = service(db);

    expect(await credits.settleMonth('2026-09')).toEqual({ period: '2026-09', settled: 1 });
    expect(await credits.settleMonth('2026-09')).toEqual({ period: '2026-09', settled: 0 });

    const overflow = db.ledger.filter((r: LedgerRow) => r.kind === 'overflow');
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ tenant_id: 25, credits: -500, period: '2026-09' });
  });

  it('settleMonth ignore les forfaits illimités et les cabinets sous leur forfait', async () => {
    const unlimited = fakeDb({ allowance: null, costs: [{ tenant_id: 1, cost: 99 }] });
    expect(await service(unlimited).settleMonth('2026-09')).toEqual({ period: '2026-09', settled: 0 });
    expect(unlimited.ledger).toHaveLength(0);

    const under = fakeDb({ allowance: 1000, costs: [{ tenant_id: 1, cost: 0.9 }] });
    expect(await service(under).settleMonth('2026-09')).toEqual({ period: '2026-09', settled: 0 });
    expect(under.ledger).toHaveLength(0);
  });

  it('un achat fait après le règlement n’est pas amputé par un nouveau passage', async () => {
    const db = fakeDb({ allowance: 1000, costs: [{ tenant_id: 25, cost: 1.5 }] });
    const credits = service(db);
    await credits.settleMonth('2026-09'); // aucun crédit acheté : ligne à 0
    await credits.creditPurchase({ tenantId: 25, paymentId: 9, credits: 400 });
    await credits.settleMonth('2026-09'); // rejeu du cron le lendemain

    expect(db.ledger.reduce((sum: number, r: LedgerRow) => sum + r.credits, 0)).toBe(400);
  });

  it('previousPeriod donne le mois écoulé', () => {
    expect(previousPeriod(new Date(2026, 10, 1))).toBe('2026-10');
    expect(previousPeriod(new Date(2026, 0, 2))).toBe('2025-12');
  });
});
