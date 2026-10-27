import {
  contentLength,
  costUsd,
  findPrice,
  parsePricingStore,
  readUsageMetadata,
  removePrice,
  upsertPrice,
  validatePriceInput,
} from './ai-usage';
import { fillDays, usagePeriod } from '../../modules/platform/ai/platform-ai-usage.service';

describe('Consommation IA', () => {
  it('lit les tokens renvoyés par le fournisseur (cache et réflexion compris)', () => {
    expect(
      readUsageMetadata({
        input_tokens: 1200,
        output_tokens: 300,
        input_token_details: { cache_read: 1000 },
        output_token_details: { reasoning: 120 },
      }),
    ).toEqual({ input: 1200, output: 300, cached: 1000, reasoning: 120 });
    // Pas d'usage (fournisseur muet ou fragment de contenu) : estimation en aval.
    expect(readUsageMetadata(undefined)).toBeNull();
    expect(readUsageMetadata({ input_tokens: 0, output_tokens: 0 })).toBeNull();
    expect(contentLength([{ type: 'text', text: 'abc' }, 'de'])).toBe(5);
  });

  it('calcule le coût en dollars, entrée en cache au tarif réduit', () => {
    const price = { input: 0.27, output: 1.1, cached_input: 0.07 };
    const cost = costUsd({ inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 500_000 }, price);
    expect(cost).toBeCloseTo(0.6 * 0.27 + 0.4 * 0.07 + 0.5 * 1.1, 10);
    // Sans tarif « cache » : prix de l'entrée.
    expect(costUsd({ inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 }, { ...price, cached_input: null })).toBeCloseTo(0.27, 10);
  });

  it('enregistre, remplace et retire un tarif par fournisseur et modèle', () => {
    let store = parsePricingStore(null);
    const price = validatePriceInput({ provider: 'deepseek', model: 'deepseek-chat', input: '0.27', output: 1.1 });
    store = upsertPrice(store, price, new Date('2026-10-18T12:00:00Z'));
    store = upsertPrice(store, { ...price, output: 1.2 });
    expect(store.prices).toHaveLength(1);
    expect(findPrice(store, 'deepseek', 'deepseek-chat')?.output).toBe(1.2);
    // Même nom de modèle chez un autre fournisseur : pas de tarif déduit.
    expect(findPrice(store, 'custom_x', 'deepseek-chat')).toBeNull();
    expect(parsePricingStore(JSON.stringify(store)).prices[0].cached_input).toBeNull();
    expect(removePrice(store, 'deepseek', 'deepseek-chat').prices).toEqual([]);
    expect(() => validatePriceInput({ provider: 'deepseek', model: 'x', input: -1, output: 1 })).toThrow('entrée');
  });

  it('borne la période et remplit les jours sans activité', () => {
    const now = new Date('2026-10-18T09:00:00Z');
    expect(usagePeriod(undefined, undefined, now)).toEqual({ from: '2026-10-01', to: '2026-10-18' });
    expect(() => usagePeriod('2026-10-20', '2026-10-01', now)).toThrow('précéder');
    expect(() => usagePeriod('2024-01-01', '2026-10-01', now)).toThrow('366');
    const days = fillDays({ from: '2026-10-01', to: '2026-10-03' }, [{ day: '2026-10-02', n: 4 }], (day) => ({ day, n: 0 }));
    expect(days).toEqual([
      { day: '2026-10-01', n: 0 },
      { day: '2026-10-02', n: 4 },
      { day: '2026-10-03', n: 0 },
    ]);
  });
});
