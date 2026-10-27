/** Revenu reconnu : étalement au prorata des jours, hors essai. */
import { describe, expect, it } from '@jest/globals';
import { spreadPayment } from './platform-revenue.service';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('spreadPayment', () => {
  it('un mois plein est reconnu sur ce mois', () => {
    const m = spreadPayment({ amount: 9900, period_start: '2026-03-01', period_end: '2026-04-01' });
    expect([...m.keys()]).toEqual(['2026-03']);
    expect(m.get('2026-03')).toBeCloseTo(9900);
  });

  it('un annuel est étalé sur 12 mois et conserve le total', () => {
    const m = spreadPayment({ amount: 120000, period_start: '2026-01-15', period_end: '2027-01-15' });
    expect(m.size).toBe(13);
    expect(sum(m)).toBeCloseTo(120000, 4);
    expect(m.get('2026-02')!).toBeGreaterThan(m.get('2026-01')!);
  });

  it("la portion d'essai n'est pas reconnue", () => {
    const m = spreadPayment({
      amount: 9900,
      period_start: '2026-01-01',
      period_end: '2026-03-01',
      trial_ends_at: '2026-02-01',
    });
    expect(m.get('2026-01')).toBeUndefined();
    expect(m.get('2026-02')).toBeCloseTo(9900);
  });

  it('les remboursements réduisent le montant reconnu', () => {
    const m = spreadPayment({ amount: 10000, refund_amount: 4000, period_start: '2026-05-01', period_end: '2026-06-01' });
    expect(m.get('2026-05')).toBeCloseTo(6000);
  });

  it('sans fin de période, tout est reconnu au mois de paiement', () => {
    const m = spreadPayment({ amount: 5000, paid_at: '2026-07-20T10:00:00', period_start: '2026-07-20', period_end: null });
    expect(m.get('2026-07')).toBe(5000);
  });
});
