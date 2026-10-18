/**
 * Consommation des modèles IA : tokens réels renvoyés par le fournisseur (repli
 * sur une estimation quand il ne les donne pas), tarifs saisis par la
 * plateforme et coût en dollars, figé au moment de l'appel.
 */

export interface AiUsageEvent {
  provider: string;
  model: string;
  /** Profil technique (fast, quality, streaming, vision…). */
  profile: string;
  inputTokens: number;
  outputTokens: number;
  /** Part de l'entrée servie par le cache du fournisseur (facturée moins cher). */
  cachedInputTokens: number;
  /** Tokens de réflexion, déjà compris dans la sortie (information). */
  reasoningTokens: number;
  /** true : le fournisseur n'a pas renvoyé l'usage, les chiffres sont estimés. */
  estimated: boolean;
}

export interface ProviderUsage {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
}

const count = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

/** `usage_metadata` de LangChain (réponse complète ou dernier fragment d'un flux). */
export function readUsageMetadata(metadata: any): ProviderUsage | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const input = count(metadata.input_tokens);
  const output = count(metadata.output_tokens);
  if (!input && !output) return null;
  return {
    input,
    output,
    cached: Math.min(count(metadata.input_token_details?.cache_read), input),
    reasoning: count(metadata.output_token_details?.reasoning),
  };
}

/** Longueur du texte d'un contenu de message (chaîne ou blocs). */
export function contentLength(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce(
      (sum, block: any) =>
        sum + (typeof block === 'string' ? block.length : String(block?.text ?? '').length),
      0,
    );
  }
  return 0;
}

export const estimateTokensFromChars = (chars: number): number => Math.ceil(Math.max(chars, 0) / 4);

// ── Tarifs (USD par million de tokens) ───────────────────────────────────────

export const PLATFORM_AI_PRICING_KEY = 'ai_model_pricing_v1';

export interface AiModelPrice {
  provider: string;
  model: string;
  /** Entrée non servie par le cache. */
  input: number;
  output: number;
  /** Entrée servie par le cache ; null = même prix que l'entrée. */
  cached_input: number | null;
  updated_at?: string;
}

export interface AiPricingStore {
  version: 1;
  currency: 'USD';
  prices: AiModelPrice[];
}

const MAX_PRICE_PER_MILLION = 10_000;

function priceValue(value: unknown, field: string, optional = false): number | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_PRICE_PER_MILLION) {
    throw new Error(`Tarif « ${field} » invalide : un nombre entre 0 et ${MAX_PRICE_PER_MILLION} est attendu`);
  }
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

export function parsePricingStore(raw: unknown): AiPricingStore {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  const prices = Array.isArray((value as any)?.prices) ? (value as any).prices : [];
  return {
    version: 1,
    currency: 'USD',
    prices: prices
      .filter((price: any) => price && typeof price.provider === 'string' && typeof price.model === 'string')
      .map((price: any) => ({
        provider: price.provider,
        model: price.model,
        input: Number(price.input) || 0,
        output: Number(price.output) || 0,
        cached_input: price.cached_input === null || price.cached_input === undefined ? null : Number(price.cached_input) || 0,
        ...(price.updated_at && { updated_at: String(price.updated_at) }),
      })),
  };
}

/** Tarif saisi pour ce modèle chez ce fournisseur (jamais déduit d'un autre fournisseur). */
export function findPrice(store: AiPricingStore, provider: string, model: string): AiModelPrice | null {
  return store.prices.find((price) => price.provider === provider && price.model === model) ?? null;
}

export function validatePriceInput(body: any): AiModelPrice {
  const provider = String(body?.provider ?? '').trim().slice(0, 64);
  const model = String(body?.model ?? '').trim().slice(0, 128);
  if (!provider || !model) throw new Error('Fournisseur et modèle sont requis');
  return {
    provider,
    model,
    input: priceValue(body?.input, 'entrée')!,
    output: priceValue(body?.output, 'sortie')!,
    cached_input: priceValue(body?.cached_input, 'entrée en cache', true),
  };
}

export function upsertPrice(store: AiPricingStore, price: AiModelPrice, now = new Date()): AiPricingStore {
  const others = store.prices.filter((item) => !(item.provider === price.provider && item.model === price.model));
  return { ...store, prices: [...others, { ...price, updated_at: now.toISOString() }] };
}

export function removePrice(store: AiPricingStore, provider: string, model: string): AiPricingStore {
  return { ...store, prices: store.prices.filter((item) => !(item.provider === provider && item.model === model)) };
}

/** Coût en USD d'un appel : entrée hors cache, entrée en cache et sortie. */
export function costUsd(
  usage: Pick<AiUsageEvent, 'inputTokens' | 'outputTokens' | 'cachedInputTokens'>,
  price: Pick<AiModelPrice, 'input' | 'output' | 'cached_input'>,
): number {
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const cachedRate = price.cached_input ?? price.input;
  return (fresh * price.input + cached * cachedRate + usage.outputTokens * price.output) / 1_000_000;
}
