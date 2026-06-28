import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

export type AiModelProfile = 'fast' | 'quality' | 'streaming';

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
    this.getModel('fast', 64);
    this.getModel('quality', 1200);
    this.getModel('streaming', 1800);
  }

  getModel(profile: AiModelProfile, maxTokens?: number): ChatOpenAI {
    const config = this.getProfileConfig(profile, maxTokens);
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

  getModelName(profile: AiModelProfile): string {
    return this.getProfileConfig(profile).model;
  }

  async invoke(profile: AiModelProfile, input: unknown, maxTokens?: number) {
    return this.getModel(profile, maxTokens).invoke(input as any);
  }

  async stream(profile: AiModelProfile, input: unknown, maxTokens?: number) {
    return this.getModel(profile, maxTokens).stream(input as any);
  }

  estimateTokens(input: unknown): number {
    const text = this.stringifyInput(input);
    return Math.ceil(text.length / 4);
  }

  private getProfileConfig(profile: AiModelProfile, maxTokens?: number): ModelProfileConfig {
    const model = profile === 'fast'
      ? process.env.AI_FAST_MODEL || process.env.AI_MODEL || 'deepseek-v4-flash'
      : profile === 'streaming'
        ? process.env.AI_STREAM_MODEL || process.env.AI_MODEL || 'GLM-5.2'
        : process.env.AI_QUALITY_MODEL || process.env.AI_MODEL || 'deepseek-v4-pro';

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
      maxRetries: this.getProfileNumber(profile, 'MAX_RETRIES', Number(process.env.AI_MAX_RETRIES || 0)),
      temperature: this.getProfileNumber(profile, 'TEMPERATURE', Number(process.env.AI_TEMPERATURE || 0)),
      apiKey: this.getApiKey(profile),
      baseURL: this.getBaseUrl(profile),
      modelKwargs: this.getModelKwargs(profile),
    };
  }

  private getApiKey(profile: AiModelProfile): string | undefined {
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
      || process.env.GLM_API_KEY
      || process.env.AI_API_KEY
      || process.env.OPENAI_API_KEY;
  }

  private getBaseUrl(profile: AiModelProfile): string {
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
      || process.env.AI_GLM_BASE_URL
      || process.env.AI_BASE_URL
      || 'https://api.z.ai/api/paas/v4/';
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
