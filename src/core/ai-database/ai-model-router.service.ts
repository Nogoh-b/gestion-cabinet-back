import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

export type AiModelProfile = 'fast' | 'quality' | 'streaming';
export type AiModelMode = 'fast' | 'balanced' | 'precise';

interface ModelProfileConfig {
  model: string;
  maxTokens: number;
  streaming: boolean;
  timeout: number;
  maxRetries: number;
  temperature: number;
  apiKey?: string;
  baseURL: string;
  modelKwargs?: Record<string, unknown>;
}

@Injectable()
export class AiModelRouterService {
  private readonly logger = new Logger(AiModelRouterService.name);
  private readonly models = new Map<string, ChatOpenAI>();

  warmUp(): void {
    this.getModel('fast', 64, undefined, 'fast');
    this.getModel('quality', 1200, undefined, 'balanced');
    this.getModel('quality', 1200, undefined, 'precise');
    this.getModel('streaming', 1800, undefined, 'balanced');
    this.getModel('streaming', 1800, undefined, 'precise');
  }

  getModel(
    profile: AiModelProfile,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ): ChatOpenAI {
    const config = this.getProfileConfig(profile, maxTokens, modelKwargsOverride, mode);
    const cacheKey = [
      profile,
      config.model,
      config.maxTokens,
      config.streaming,
      config.timeout,
      config.maxRetries,
      config.temperature,
      config.baseURL,
      JSON.stringify(config.modelKwargs ?? {}),
    ].join(':');
    const cached = this.models.get(cacheKey);
    if (cached) return cached;

    const chatConfig: ConstructorParameters<typeof ChatOpenAI>[0] = {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      apiKey: config.apiKey,
      configuration: {
        baseURL: config.baseURL,
      },
      streaming: config.streaming,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
    };

    if (config.modelKwargs && Object.keys(config.modelKwargs).length > 0) {
      (chatConfig as any).modelKwargs = config.modelKwargs;
    }

    const model = new ChatOpenAI(chatConfig);

    this.installApproximateTokenCounter(model);
    this.models.set(cacheKey, model);
    this.logger.log(`Modele IA ${profile} pret: ${config.model} (${config.maxTokens} tokens)`);
    return model;
  }

  getModelName(profile: AiModelProfile, mode?: AiModelMode): string {
    return this.getProfileConfig(profile, undefined, undefined, mode).model;
  }

  async invoke(
    profile: AiModelProfile,
    input: unknown,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ) {
    return this.getModel(profile, maxTokens, modelKwargsOverride, mode).invoke(input as any);
  }

  async stream(
    profile: AiModelProfile,
    input: unknown,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ) {
    return this.getModel(profile, maxTokens, modelKwargsOverride, mode).stream(input as any);
  }

  /**
   * Construit les `modelKwargs` de contrôle de la réflexion (« thinking ») du
   * modèle, selon un niveau demandé. Le CONTENU exact est piloté par les
   * variables d'env `AI_REASONING_KWARGS_FAST|BALANCED|PRECISE` (JSON brut),
   * pour s'adapter au paramètre réel du fournisseur sans redéploiement :
   *   AI_REASONING_KWARGS_FAST={"reasoning_effort":"low"}
   *   AI_REASONING_KWARGS_FAST={"enable_thinking":false}   // variante on/off
   * Non renseigné → aucun override (comportement historique).
   */
  reasoningKwargs(level: 'fast' | 'balanced' | 'precise'): Record<string, unknown> | undefined {
    const raw = process.env[`AI_REASONING_KWARGS_${level.toUpperCase()}`];
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      this.logger.warn(`AI_REASONING_KWARGS_${level.toUpperCase()} invalide: JSON attendu`);
      return undefined;
    }
  }

  estimateTokens(input: unknown): number {
    const text = this.stringifyInput(input);
    return Math.ceil(text.length / 4);
  }

  private getProfileConfig(
    profile: AiModelProfile,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ): ModelProfileConfig {
    const model = this.getConfiguredModel(profile, mode);

    const defaults: Record<AiModelProfile, number> = {
      fast: 300,
      quality: 900,
      streaming: 1400,
    };

    return {
      model,
      maxTokens: maxTokens ?? this.getProfileNumber(profile, 'MAX_TOKENS', defaults[profile]),
      streaming: profile === 'streaming',
      timeout: this.getProfileNumber(profile, 'TIMEOUT_MS', Number(process.env.AI_TIMEOUT_MS || 35000)),
      // Défaut à 2 (au lieu de 0) : le SDK OpenAI retente en interne (backoff
      // exponentiel) les erreurs de connexion transitoires ("Connection error.")
      // avant de remonter une erreur. Sans ça, le moindre accroc réseau
      // provoquait un échec immédiat et visible sur chaque appel LLM du module.
      maxRetries: this.getProfileNumber(profile, 'MAX_RETRIES', Number(process.env.AI_MAX_RETRIES ?? 2)),
      temperature: this.getProfileNumber(profile, 'TEMPERATURE', Number(process.env.AI_TEMPERATURE || 0)),
      apiKey: this.getApiKey(profile, mode),
      baseURL: this.getBaseUrl(profile, mode),
      modelKwargs: this.mergeModelKwargs(this.getModelKwargs(profile), modelKwargsOverride),
    };
  }

  /**
   * Le profil décrit l'usage technique (petite réponse, plan/SQL, streaming),
   * tandis que le mode demandé par le chat choisit réellement la gamme du
   * modèle : rapide/équilibré sur Flash, précis sur Pro.
   */
  private getConfiguredModel(profile: AiModelProfile, mode?: AiModelMode): string {
    if (mode === 'precise') {
      return process.env.AI_PRECISE_MODEL
        || process.env.AI_QUALITY_MODEL
        || process.env.AI_MODEL
        || 'deepseek-v4-pro';
    }

    if (mode === 'fast' || mode === 'balanced') {
      return process.env.AI_FLASH_MODEL
        || process.env.AI_FAST_MODEL
        || process.env.AI_MODEL
        || 'deepseek-v4-flash';
    }

    return profile === 'fast'
      ? process.env.AI_FAST_MODEL || process.env.AI_MODEL || 'deepseek-v4-flash'
      : profile === 'streaming'
        ? process.env.AI_STREAM_MODEL || process.env.AI_MODEL || 'deepseek-v4-flash'
        : process.env.AI_QUALITY_MODEL || process.env.AI_MODEL || 'deepseek-v4-flash';
  }

  /** Fusionne les modelKwargs d'env avec un override par requête (override gagne).
   *  Renvoie `undefined` si le résultat est vide, pour ne pas polluer la cacheKey. */
  private mergeModelKwargs(
    base: Record<string, unknown> | undefined,
    override: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!base && !override) return undefined;
    const merged = { ...(base ?? {}), ...(override ?? {}) };
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private getApiKey(profile: AiModelProfile, mode?: AiModelMode): string | undefined {
    if (mode) {
      return process.env.DEEPSEEK_API_KEY
        || process.env.AI_API_KEY
        || process.env.OPENAI_API_KEY;
    }

    if (profile === 'fast') {
      return process.env.AI_FAST_API_KEY
        || process.env.DEEPSEEK_API_KEY
        || process.env.AI_API_KEY
        || process.env.OPENAI_API_KEY;
    }

    if (profile === 'quality') {
      return process.env.AI_QUALITY_API_KEY
        || process.env.DEEPSEEK_API_KEY
        || process.env.AI_API_KEY
        || process.env.OPENAI_API_KEY;
    }

    return process.env.AI_STREAM_API_KEY
      || process.env.DEEPSEEK_API_KEY
      || process.env.GLM_API_KEY
      || process.env.AI_API_KEY
      || process.env.OPENAI_API_KEY;
  }

  private getBaseUrl(profile: AiModelProfile, mode?: AiModelMode): string {
    if (mode) {
      return process.env.AI_DEEPSEEK_BASE_URL
        || process.env.AI_BASE_URL
        || 'https://api.deepseek.com';
    }

    if (profile === 'fast') {
      return process.env.AI_FAST_BASE_URL
        || process.env.AI_DEEPSEEK_BASE_URL
        || process.env.AI_BASE_URL
        || 'https://api.deepseek.com';
    }

    if (profile === 'quality') {
      return process.env.AI_QUALITY_BASE_URL
        || process.env.AI_DEEPSEEK_BASE_URL
        || process.env.AI_BASE_URL
        || 'https://api.deepseek.com';
    }

    return process.env.AI_STREAM_BASE_URL
      || process.env.AI_DEEPSEEK_BASE_URL
      || process.env.AI_GLM_BASE_URL
      || process.env.AI_BASE_URL
      || 'https://api.deepseek.com';
  }

  private getProfileNumber(profile: AiModelProfile, suffix: string, fallback: number): number {
    const profileKey = profile === 'streaming' ? 'STREAM' : profile.toUpperCase();
    const raw = process.env[`AI_${profileKey}_${suffix}`];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  private getModelKwargs(profile: AiModelProfile): Record<string, unknown> | undefined {
    const profileKey = profile === 'streaming' ? 'STREAM' : profile.toUpperCase();
    const raw = process.env[`AI_${profileKey}_MODEL_KWARGS`] || process.env.AI_MODEL_KWARGS;
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      this.logger.warn(`AI_${profileKey}_MODEL_KWARGS invalide: JSON attendu`);
      return undefined;
    }
  }

  private stringifyInput(input: unknown): string {
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      return input.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'content' in item) {
          return String((item as any).content ?? '');
        }
        return JSON.stringify(item);
      }).join('\n');
    }
    try {
      return JSON.stringify(input);
    } catch {
      return String(input ?? '');
    }
  }

  private installApproximateTokenCounter(model: ChatOpenAI) {
    const getNumTokens = async (content: unknown): Promise<number> => {
      const text = this.stringifyInput(content);
      return Math.ceil(text.length / 4);
    };
    (model as ChatOpenAI & { getNumTokens: (content: unknown) => Promise<number> }).getNumTokens = getNumTokens;
  }
}
