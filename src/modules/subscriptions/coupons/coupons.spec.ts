/** Calcul des remises de codes promo. */
import { describe, expect, it } from '@jest/globals';
import { computeDiscount } from './coupons.service';

describe('computeDiscount', () => {
  it('remise en pourcentage, net arrondi au multiple de 5 (XAF)', () => {
    expect(computeDiscount({ type: 'percent', value: 15 } as any, 9900, 'XAF')).toEqual({
      discount: 1485,
      net: 8415,
      free_months: 0,
    });
    // 12 % de 9 900 = 1 188 → net 8 712 arrondi à 8 710 (en faveur du client).
    expect(computeDiscount({ type: 'percent', value: 12 } as any, 9900, 'XAF')).toEqual({
      discount: 1190,
      net: 8710,
      free_months: 0,
    });
  });

  it('remise fixe plafonnée au montant', () => {
    expect(computeDiscount({ type: 'fixed', value: 50000 } as any, 29900, 'XAF').net).toBe(0);
  });

  it('mois offerts : montant inchangé', () => {
    expect(computeDiscount({ type: 'free_months', value: 2 } as any, 29900, 'XAF')).toEqual({
      discount: 0,
      net: 29900,
      free_months: 2,
    });
  });

  it('devise à centimes : arrondi au centime', () => {
    expect(computeDiscount({ type: 'percent', value: 33 } as any, 19.99, 'EUR').net).toBe(13.39);
  });
});
