import { describe, expect, it } from '@jest/globals';

import { isWinningOutcome, principalAmountFromDecision } from './result-fee-from-decision';

describe('honoraire de résultat depuis la décision', () => {
  it('lit le montant en principal du dispositif', () => {
    expect(
      principalAmountFromDecision(
        'Condamnation de Kribi Logistique SA à 7 400 000 FCFA en principal et 350 000 FCFA de dommages et intérêts.',
      ),
    ).toBe(7_400_000);
  });

  it('préfère le principal même cité après un autre montant', () => {
    expect(
      principalAmountFromDecision('<p>350.000 F CFA de dommages ; principal : 2 000 000 XAF</p>'),
    ).toBe(2_000_000);
  });

  it('prend le premier montant à défaut de principal, et rien sans montant', () => {
    expect(principalAmountFromDecision('Allocation de 1 250 000 FCFA au demandeur.')).toBe(1_250_000);
    expect(principalAmountFromDecision('Le tribunal fait droit à la demande.')).toBeNull();
  });

  it('ne retient que les issues favorables ou partielles', () => {
    expect(isWinningOutcome('favorable')).toBe(true);
    expect(isWinningOutcome('partial')).toBe(true);
    expect(isWinningOutcome('unfavorable')).toBe(false);
    expect(isWinningOutcome(null)).toBe(false);
  });
});
