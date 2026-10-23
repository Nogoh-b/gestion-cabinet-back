import { BadRequestException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChatOpenAI } from '@langchain/openai';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { getCurrentTenantId, hasActiveTenant } from '../tenant/tenant.context';
import { readAiPlanPolicy, resolveSubscriptionAiConfig } from './ai-subscription-policy';
import {
  AiStoredConfig,
  parseStoredAiConfig,
  PLATFORM_AI_SETTING_KEY,
} from './ai-provider-config';
import {
  AiUsageEvent,
  contentLength,
  estimateTokensFromChars,
  ProviderUsage,
  readUsageMetadata,
} from './ai-usage';

export type AiModelProfile = 'fast' | 'quality' | 'streaming';
export type AiModelMode = 'fast' | 'balanced' | 'precise';

export interface AiProviderDefinition {
  id: string;
  label: string;
  base_url: string;
  models: string[];
  description: string;
  /**
   * Réflexion par défaut propre au fournisseur, prioritaire sur les variables
   * génériques `AI_REASONING_KWARGS_*` / `AI_FAST_MODEL_KWARGS` (elles-mêmes
   * surchargées par `AI_REASONING_KWARGS_<NIVEAU>_<FOURNISSEUR>` et
   * `AI_<FOURNISSEUR>_FAST_MODEL_KWARGS`). `fastProfile` s'applique au profil
   * `fast` (classification, réponses conversationnelles).
   */
  reasoningDefaults?: Partial<
    Record<AiModelMode | 'fastProfile', Record<string, unknown>>
  >;
}

/**
 * Fournisseurs proposes nativement dans la console plateforme. Les secrets ne
 * sont jamais places ici : ils proviennent exclusivement des variables
 * d'environnement ou, pour une configuration personnalisee, du catalogue IA de
 * la plateforme (`platform_settings['ai']`).
 */
export const BUILTIN_AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'mimo',
    label: 'Xiaomi MiMo',
    base_url: 'https://api.xiaomimimo.com/v1',
    models: ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed', 'mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.5-asr', 'mimo-v2.5-tts', 'mimo-v2.5-tts-voiceclone', 'mimo-v2.5-tts-voicedesign'],
    description: 'Modèles de conversation Xiaomi MiMo ; catalogue actualisé via /v1/models',
    reasoningDefaults: {
      fastProfile: { thinking: { type: 'disabled' } },
      fast: { thinking: { type: 'disabled' } },
      balanced: { thinking: { type: 'disabled' } },
      precise: { thinking: { type: 'enabled' } },
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com',
    models: [
      'deepseek-flash',
      'deepseek-v4-pro',
      // Alias historique encore accepté par l'API pour V4.1 Flash.
      'deepseek-v4-flash',
    ],
    description: "Fournisseur DeepSeek compatible avec l'API OpenAI",
    // DeepSeek v4 réfléchit par défaut, même avec `reasoning_effort: low`.
    // Mesures du 2026-10-13 sur une question multi-ressources réelle, avec
    // `thinking` désactivé : rédaction 10 s → 1 s avant le premier mot, SQL
    // 6 s → 2,5 s, requêtes valides sans correction. Équilibré et Précis
    // gardent la réflexion (variables génériques).
    reasoningDefaults: {
      fastProfile: { thinking: { type: 'disabled' } },
      fast: { thinking: { type: 'disabled' } },
    },
  },
  {
    id: 'glm',
    label: 'GLM (Z.AI)',
    base_url: 'https://api.z.ai/api/paas/v4',
    models: [
      'glm-5.3',
      'glm-5.3-flash',
      'glm-5.3-flashx',
      'glm-5.2',
      'glm-5.1',
      'glm-5',
      'glm-4.7',
      'glm-4.6',
    ],
    description: "Modèles GLM via l'API de chat compatible OpenAI de Z.AI",
    reasoningDefaults: {
      fastProfile: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
      fast: { thinking: { type: 'enabled' }, reasoning_effort: 'low' },
      balanced: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
      precise: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    },
  },
  {
    id: 'meta',
    label: 'Meta AI (Muse)',
    base_url: 'https://api.meta.ai/v1',
    models: [
      'muse-spark-1.3-contributor',
      'muse-spark-1.3',
      'muse-spark-1.2-contributor',
      'muse-spark-1.2',
      'muse-spark-1.1',
      'muse-wonder-1.0',
    ],
    description: 'Muse Spark et Muse Wonder via Meta AI',
    // Sans paramètre, Muse Spark réfléchit (en caché) ~1 000 tokens avant de
    // répondre : ~14 s par appel, et une classification limitée à 64 tokens
    // revient vide. Mesures du 2026-10-13 sur le prompt SQL réel : `minimal`
    // → 3,5 s, `low` → 7 s, requête SQL identique. `precise` garde le réglage
    // générique (plus de réflexion, plus lent).
    reasoningDefaults: {
      fastProfile: { reasoning_effort: 'minimal' },
      fast: { reasoning_effort: 'minimal' },
      balanced: { reasoning_effort: 'low' },
    },
  },
  {
    id: 'freellm',
    label: 'FreeLLM (Bisoft)',
    base_url: 'https://freellm.bisoft-solutions.com/v1',
    models: ['auto'],
    description:
      'Passerelle Bisoft avec catalogue de modeles charge depuis /v1/models',
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ],
    description:
      "Gemini via l'endpoint compatible OpenAI — modeles configurables",
    // Gemini mappe `reasoning_effort` (minimal/low/medium/high, `none` pour
    // desactiver sur les 2.5). `minimal` en profil fast pour rester reactif.
    reasoningDefaults: {
      fastProfile: { reasoning_effort: 'minimal' },
      fast: { reasoning_effort: 'minimal' },
      balanced: { reasoning_effort: 'low' },
    },
  },
] as const;

/** Seul modèle DeepSeek qui lit les images (la gamme Pro les ignore). */
export const DEEPSEEK_VISION_MODEL = 'deepseek-flash';

/** Événement émis quand la config IA d'un cabinet change (invalidation du cache). */
export const AI_CONFIG_CHANGED_EVENT = 'ai.config.changed';

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
  useResponsesApi: boolean;
}

/**
 * Description EXACTE du modèle résolu pour un appel donné.
 *
 * Objet unique retourné par la même résolution que celle qui construit (ou
 * réutilise) l'instance `ChatOpenAI` : le modèle loggé est donc, par
 * construction, celui qui est réellement appelé.
 */
export interface AiModelDescriptor {
  /** Profil technique demandé (taille de réponse / streaming). */
  profile: AiModelProfile;
  /** Gamme choisie par l'utilisateur : fast | balanced | precise. */
  mode: AiModelMode;
  /** Fournisseur résolu : deepseek | meta | freellm | custom | <id libre>. */
  provider: string;
  /** Identifiant du modèle envoyé à l'API. */
  model: string;
  /** URL de base réellement utilisée. */
  baseURL: string;
  /**
   * Origine de la configuration : `tenant` = base de données (exception du
   * cabinet ou moteur par défaut de la plateforme), `env` = variables serveur.
   */
  source: 'tenant' | 'env';
  /** Cabinet concerné (null hors contexte tenant). */
  tenantId: number | null;
  /** Une clé API a-t-elle été résolue ? */
  hasApiKey: boolean;
  /** Réponse consommée en streaming ? */
  streaming: boolean;
  maxTokens: number;
  temperature: number;
}

export interface TenantAiEffective {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  fastModel?: string;
  qualityModel?: string;
  streamingModel?: string;
  /** Identifiant du fournisseur issu de `ai_config.active_provider`. */
  providerId?: string;
}

export interface AiProviderRuntimeConfig {
  base_url: string;
  api_key?: string;
  model: string;
}

@Injectable()
export class AiModelRouterService {
  private readonly logger = new Logger(AiModelRouterService.name);
  private readonly models = new Map<string, ChatOpenAI>();
  private readonly providerModelsCache = new Map<
    string,
    { models: string[]; ts: number }
  >();
  private readonly PROVIDER_MODELS_CACHE_TTL = 5 * 60_000;
  private usageListener?: (event: AiUsageEvent) => void;

  // ── Cache tenant ai_config (sync read, async refresh) ──────────────
  private readonly tenantConfigCache = new Map<
    number,
    { config: any; ts: number }
  >();
  private readonly loadingPromises = new Map<number, Promise<void>>();
  private readonly TENANT_CACHE_TTL = 30_000; // 30s
  private platformConfigCache: { config: AiStoredConfig | null; ts: number } | null = null;

  constructor(
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  listBuiltinProviders(): AiProviderDefinition[] {
    return BUILTIN_AI_PROVIDERS.map((provider) => ({
      ...provider,
      models: [...provider.models],
    }));
  }

  getBuiltinProvider(providerId: string): AiProviderDefinition | undefined {
    return BUILTIN_AI_PROVIDERS.find((provider) => provider.id === providerId);
  }

  isBuiltinProvider(providerId: string): boolean {
    return !!this.getBuiltinProvider(providerId);
  }

  /** Resout une configuration complete sans exposer le secret au client. */
  getProviderRuntimeConfig(
    providerId: string,
    stored?: any,
  ): AiProviderRuntimeConfig | null {
    const definition = this.getBuiltinProvider(providerId);
    // Pour un fournisseur integre, l'URL et la cle restent exclusivement sous
    // controle serveur. Les anciennes valeurs stockees par cabinet sont ignorees.
    const baseUrl = String(
      definition
        ? (this.getProviderEnvBaseUrl(providerId) ?? definition.base_url)
        : (stored?.base_url ?? stored?.baseURL ?? ''),
    ).trim();
    const configuredModel = String(
      stored?.model ?? definition?.models?.[0] ?? '',
    ).trim();
    // Compatibilite avec les anciens identifiants enregistres dans ai_config.
    // Meta : `muse-spark-1.3` nu redirige vers l'offre Contributor (tarif
    // reduit, donnees utilisables pour l'entrainement) et FreeLLM expose
    // `auto` (ancien libelle `multi-models`).
    // Google : le catalogue /v1/models renvoie des IDs prefixes `models/…`
    // (format natif Gemini) — l'endpoint compatible OpenAI attend l'ID nu.
    let model =
      providerId === 'freellm' && configuredModel === 'multi-models'
        ? 'auto'
        : providerId === 'meta' && configuredModel === 'muse-spark-1.3'
          ? 'muse-spark-1.3-contributor'
          : configuredModel;
    if (providerId === 'google') {
      model = model.replace(/^models\//, '');
    }
    const storedApiKey = definition
      ? ''
      : String(stored?.api_key ?? stored?.apiKey ?? '').trim();
    const apiKey = String(
      definition
        ? (this.getProviderEnvApiKey(providerId) ?? '')
        : (this.revealApiKey(storedApiKey) ?? ''),
    ).trim();

    if (!baseUrl || !model) return null;
    return { base_url: baseUrl, model, api_key: apiKey || undefined };
  }

  /**
   * Retourne le catalogue de modeles affiche dans l'administration.
   * DeepSeek suit son endpoint documenté `/models`; FreeLLM et Google suivent
   * également leur catalogue OpenAI-compatible. GLM reprend les IDs publiés
   * dans la documentation officielle Z.AI.
   */
  async listAvailableModels(
    providerId: string,
    runtime?: AiProviderRuntimeConfig | null,
    includeAudio = false,
  ): Promise<string[]> {
    const visible = (models: string[]) => providerId === 'mimo' && !includeAudio
      ? models.filter(id => !/(?:^|-)(?:asr|tts)(?:-|$)/i.test(id))
      : models;
    const definition = this.getBuiltinProvider(providerId);
    const fallback = Array.from(
      new Set([
        ...(runtime?.model ? [runtime.model] : []),
        ...(definition?.models ?? []),
      ]),
    ).filter(Boolean);

    if (!['deepseek', 'freellm', 'google', 'mimo'].includes(providerId)) {
      return visible(fallback);
    }
    if (!runtime?.api_key || !runtime.base_url) {
      return visible(fallback);
    }

    const unsafeReason = this.unsafeProviderUrlReason(runtime.base_url);
    if (unsafeReason) {
      this.logger.warn(`Catalogue ${providerId} ignore: ${unsafeReason}`);
      return visible(fallback);
    }

    const cacheKey = `${providerId}:${runtime.base_url}`;
    const cached = this.providerModelsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.PROVIDER_MODELS_CACHE_TTL) {
      return visible([...cached.models]);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(
        `${runtime.base_url.replace(/\/$/, '')}/models`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${runtime.api_key}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: Array<{ id?: unknown; available?: unknown }>;
      };
      const fetchedModels = (Array.isArray(payload?.data) ? payload.data : [])
        // FreeLLM publie aussi les modeles connus mais inutilisables pour le
        // compte courant (`available: false`, par exemple `no_key`). Ne pas
        // les proposer dans l'administration puisqu'un test echouerait.
        .filter((item) => item?.available !== false)
        .map((item) => (typeof item?.id === 'string' ? item.id.trim() : ''))
        .filter(Boolean)
        // Google renvoie des IDs natifs `models/…` : l'endpoint OpenAI
        // attend l'ID nu, on affiche donc la forme utilisable.
        .map((id) =>
          providerId === 'google' ? id.replace(/^models\//, '') : id,
        )
        .filter(Boolean);
      const models = Array.from(
        new Set([
          ...fetchedModels,
          // DeepSeek maintient cet alias historique bien qu'il n'apparaisse
          // plus dans /models : il pointe toujours vers V4.1 Flash.
          ...(providerId === 'deepseek' ? ['deepseek-v4-flash'] : []),
        ]),
      );
      if (!models.length) throw new Error('catalogue vide');

      this.providerModelsCache.set(cacheKey, { models, ts: Date.now() });
      return visible([...models]);
    } catch (error) {
      this.logger.warn(
        `Chargement des modeles ${providerId} echoue: ${(error as Error).message}`,
      );
      return visible(fallback);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Chiffre une cle personnalisee avant son stockage dans `cabinets.ai_config`. */
  protectApiKey(value: string): string {
    const plain = String(value ?? '').trim();
    if (!plain || plain.startsWith('enc:v1:')) return plain;
    const key = this.apiConfigEncryptionKey();
    if (!key) {
      throw new Error(
        'AI_CONFIG_ENCRYPTION_KEY (ou JWT_SECRET) est requis pour stocker une cle IA',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  private revealApiKey(value: string): string | undefined {
    if (!value) return undefined;
    if (!value.startsWith('enc:v1:')) return value; // compatibilite avec les donnees existantes
    const key = this.apiConfigEncryptionKey();
    if (!key) return undefined;
    try {
      const [, , ivRaw, tagRaw, encryptedRaw] = value.split(':');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivRaw, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedRaw, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      this.logger.error(
        `Impossible de dechiffrer une cle IA: ${(error as Error).message}`,
      );
      return undefined;
    }
  }

  private apiConfigEncryptionKey(): Buffer | null {
    const secret =
      process.env.AI_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET;
    return secret ? createHash('sha256').update(secret).digest() : null;
  }

  /** Invalide le cache IA d'un tenant (appelé après PUT /settings/app). */
  invalidateTenantCache(tenantId: number): void {
    this.tenantConfigCache.delete(tenantId);
    this.logger.log(
      `[AI-MODEL] cache config IA invalidé pour le cabinet #${tenantId}`,
    );
  }

  /**
   * La config IA d'un cabinet vient d'être modifiée (PUT /api/settings/app) :
   * on purge son cache pour que le changement prenne effet immédiatement,
   * sans attendre le TTL, et on jette les instances déjà construites.
   */
  @OnEvent(AI_CONFIG_CHANGED_EVENT)
  onAiConfigChanged(payload: { tenantId?: number }): void {
    const tenantId = payload?.tenantId;
    if (typeof tenantId === 'number') {
      this.invalidateTenantCache(tenantId);
    } else {
      this.clearAllCache();
    }
    // Les instances ChatOpenAI embarquent l'ancienne clé/modèle : on les
    // reconstruit au prochain appel.
    this.models.clear();
  }

  clearAllCache(): void {
    this.tenantConfigCache.clear();
    this.platformConfigCache = null;
    this.models.clear();
  }

  /**
   * Charge (et met en cache) la config IA du cabinet courant AVANT toute
   * résolution de modèle.
   *
   * Indispensable à la justesse : `getTenantEffectiveSync()` est synchrone et
   * ne peut pas lire la base. Sans ce préchargement, le premier appel d'une
   * requête — voire d'un processus fraîchement démarré — résoudrait le modèle
   * sur les variables d'ENV, puis un appel ultérieur basculerait sur la config
   * du cabinet, au sein de la MÊME requête.
   *
   * @returns true si une config cabinet a effectivement été chargée.
   */
  async ensureTenantConfigLoaded(tenantIdOverride?: number): Promise<boolean> {
    if (!this.dataSource) return false;
    if (tenantIdOverride === undefined && !hasActiveTenant()) return false;

    const tenantId = tenantIdOverride ?? getCurrentTenantId();
    const cached = this.tenantConfigCache.get(tenantId);
    if (cached && Date.now() - cached.ts < this.TENANT_CACHE_TTL) return cached.config != null;

    await this.loadTenantConfigAsync(tenantId);
    return this.tenantConfigCache.get(tenantId)?.config != null;
  }

  warmUp(): void {
    this.getModel('fast', 64, undefined, 'fast');
    this.getModel('quality', 1200, undefined, 'balanced');
    this.getModel('quality', 1200, undefined, 'precise');
    this.getModel('streaming', 1800, undefined, 'balanced');
    this.getModel('streaming', 1800, undefined, 'precise');
  }

  /**
   * Résout la config ET construit (ou réutilise) l'instance, en une seule
   * résolution. Le descripteur retourné décrit donc exactement le modèle qui
   * sera appelé — c'est ce que loggent les appelants.
   */
  getModelWithDescriptor(
    profile: AiModelProfile,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
    effectiveOverride?: TenantAiEffective | null,
  ): { model: ChatOpenAI; descriptor: AiModelDescriptor } {
    const { config, descriptor } = this.resolve(
      profile,
      maxTokens,
      modelKwargsOverride,
      mode,
      effectiveOverride,
    );
    if (descriptor.source === 'tenant' && !config.apiKey) {
      throw new ServiceUnavailableException('La clé du moteur IA attribué est indisponible');
    }
    const cacheKey = [
      profile,
      config.model,
      config.maxTokens,
      config.streaming,
      config.timeout,
      config.maxRetries,
      config.temperature,
      config.baseURL,
      config.apiKey
        ? createHash('sha256').update(config.apiKey).digest('hex').slice(0, 16)
        : 'no-key',
      JSON.stringify(config.modelKwargs ?? {}),
      config.useResponsesApi,
    ].join(':');
    const cached = this.models.get(cacheKey);
    if (cached) return { model: cached, descriptor };

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
      useResponsesApi: config.useResponsesApi,
    };

    if (config.modelKwargs && Object.keys(config.modelKwargs).length > 0) {
      (chatConfig as any).modelKwargs = config.modelKwargs;
    }

    if (descriptor.provider === 'mimo') {
      // MiMo documents max_completion_tokens, including reasoning tokens.
      delete chatConfig.maxTokens;
      chatConfig.modelKwargs = { ...chatConfig.modelKwargs, max_completion_tokens: config.maxTokens };
    }

    const model = new ChatOpenAI(chatConfig);

    this.installApproximateTokenCounter(model);
    this.trackUsage(model, {
      provider: descriptor.provider,
      model: config.model,
      profile,
    });
    this.models.set(cacheKey, model);
    this.logger.log(
      `[AI-MODEL] instance créée → ${this.formatDescriptor(descriptor)}`,
    );
    if (!descriptor.hasApiKey) {
      this.logger.warn(
        `[AI-MODEL] ⚠️ aucune clé API résolue pour provider=${descriptor.provider} ` +
          `(source=${descriptor.source}) — les appels vont échouer en 401. ` +
          `Renseignez la clé dans la console plateforme (Intelligence artificielle) ou la variable d'env correspondante.`,
      );
    }
    return { model, descriptor };
  }

  /** Ligne de log canonique décrivant un modèle résolu. */
  formatDescriptor(d: AiModelDescriptor): string {
    return [
      `provider=${d.provider}`,
      `model=${d.model}`,
      `base=${d.baseURL}`,
      `profil=${d.profile}`,
      `mode=${d.mode}`,
      `stream=${d.streaming}`,
      `maxTokens=${d.maxTokens}`,
      `temp=${d.temperature}`,
      `cabinet=${d.tenantId ?? '-'}`,
      `source=${d.source}`,
      `cle=${d.hasApiKey ? 'oui' : 'NON'}`,
    ].join(' ');
  }

  getModel(
    profile: AiModelProfile,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ): ChatOpenAI {
    return this.getModelWithDescriptor(
      profile,
      maxTokens,
      modelKwargsOverride,
      mode,
    ).model;
  }

  /** Nom du modèle résolu (même résolution que l'instance réellement appelée). */
  getModelName(profile: AiModelProfile, mode?: AiModelMode): string {
    return this.resolve(profile, undefined, undefined, mode).descriptor.model;
  }

  /** Descripteur complet du modèle résolu — pour l'affichage admin et les logs. */
  describe(profile: AiModelProfile, mode?: AiModelMode): AiModelDescriptor {
    return this.resolve(profile, undefined, undefined, mode).descriptor;
  }

  /** Retourne la config effective (tenant + env) — utile pour l'admin UI. */
  getEffectiveConfigSync(
    profile: AiModelProfile,
    mode?: AiModelMode,
  ): {
    model: string;
    baseURL: string;
    hasApiKey: boolean;
    source: 'tenant' | 'env';
  } {
    const d = this.resolve(profile, undefined, undefined, mode).descriptor;
    return {
      model: d.model,
      baseURL: d.baseURL,
      hasApiKey: d.hasApiKey,
      source: d.source,
    };
  }

  async getEffectiveConfigAsync(
    tenantId: number,
  ): Promise<{ tenantConfig: any; effective: TenantAiEffective | null }> {
    const raw = await this.loadTenantConfig(tenantId);
    this.tenantConfigCache.set(tenantId, { config: raw, ts: Date.now() });
    const effective = raw ? this.resolveTenantEffective(raw) : null;
    return { tenantConfig: raw, effective };
  }

  /** Explicit platform resolution: never inherits cabinet #1 or an impersonated tenant. */
  async getPlatformAssistantModels() {
    const raw = await this.loadPlatformConfig();
    const ids = [...new Set([...BUILTIN_AI_PROVIDERS.map((p) => p.id), ...Object.keys(raw?.providers ?? {})])];
    const groups = await Promise.all(ids.map(async (id) => {
      const runtime = this.getProviderRuntimeConfig(id, raw?.providers?.[id]);
      if (!runtime?.api_key || this.unsafeProviderUrlReason(runtime.base_url)) return [];
      const models = await this.listAvailableModels(id, runtime);
      return models.map((model) => ({ provider_id: id, model, label: `${this.getBuiltinProvider(id)?.label ?? raw?.providers?.[id]?.label ?? id} · ${model}` }));
    }));
    return groups.flat();
  }

  async getPlatformModel(maxTokens = 7000, choice: { provider_id?: string; model?: string; quality?: AiModelMode } = {}): Promise<ChatOpenAI> {
    const raw = await this.loadPlatformConfig();
    let effective = raw ? this.resolveTenantEffective(raw) : null;
    if (choice.provider_id || choice.model) {
      const available = await this.getPlatformAssistantModels();
      if (!available.some((entry) => entry.provider_id === choice.provider_id && entry.model === choice.model))
        throw new BadRequestException('Ce modèle n’est plus disponible. Choisissez un autre modèle.');
      effective = this.resolveTenantEffective({ ...raw, active_provider: choice.provider_id });
      if (!effective) throw new BadRequestException('Ce moteur n’est pas configuré.');
      effective = { ...effective, model: choice.model, fastModel: choice.model, qualityModel: choice.model, streamingModel: choice.model };
    }
    return this.getModelWithDescriptor('quality', maxTokens, undefined, choice.quality ?? 'balanced', effective).model;
  }

  /**
   * Modèle qui lit les images (pièces jointes, PDF numérisés), ou `null`.
   *
   * Le moteur du cabinet lit lui-même les images quand il en est capable :
   * DeepSeek via `deepseek-flash` (seul modèle DeepSeek multimodal : la gamme
   * Pro ignore l'image, quel que soit le niveau de réflexion choisi), Gemini
   * via son propre modèle. `AI_VISION_MODEL` (+ `AI_VISION_PROVIDER`, ou
   * `AI_VISION_BASE_URL` / `AI_VISION_API_KEY`) impose un autre modèle. Sinon,
   * les images sont lues par l'OCR local du serveur.
   */
  getVisionModel(maxTokens = 4000): { model: ChatOpenAI; label: string } | null {
    const envModel = process.env.AI_VISION_MODEL?.trim();
    const engine = this.resolve('quality');
    const engineProvider = engine.descriptor.provider;
    let runtime: AiProviderRuntimeConfig | null = null;
    let provider = '';
    if (envModel && process.env.AI_VISION_BASE_URL?.trim()) {
      provider = 'custom';
      runtime = {
        base_url: process.env.AI_VISION_BASE_URL.trim(),
        api_key: process.env.AI_VISION_API_KEY?.trim() || undefined,
        model: envModel,
      };
    } else if (envModel) {
      provider = process.env.AI_VISION_PROVIDER?.trim() || engineProvider;
      runtime = provider === engineProvider
        ? { base_url: engine.config.baseURL, api_key: engine.config.apiKey, model: envModel }
        : this.getProviderRuntimeConfig(provider, { model: envModel });
    } else if (engineProvider === 'deepseek' || engineProvider === 'google') {
      provider = engineProvider;
      runtime = {
        base_url: engine.config.baseURL,
        api_key: engine.config.apiKey,
        model: engineProvider === 'deepseek' ? DEEPSEEK_VISION_MODEL : engine.config.model,
      };
    }
    if (!runtime?.api_key || !runtime.base_url || !runtime.model) return null;
    const unsafeReason = this.unsafeProviderUrlReason(runtime.base_url);
    if (unsafeReason) {
      this.logger.warn(`Modèle vision ignoré : ${unsafeReason}`);
      return null;
    }

    const cacheKey = [
      'vision',
      runtime.model,
      runtime.base_url,
      maxTokens,
      createHash('sha256').update(runtime.api_key).digest('hex').slice(0, 16),
    ].join(':');
    let model = this.models.get(cacheKey);
    if (!model) {
      const chatConfig: ConstructorParameters<typeof ChatOpenAI>[0] = {
        model: runtime.model,
        apiKey: runtime.api_key,
        temperature: 0,
        maxTokens,
        configuration: { baseURL: runtime.base_url },
        timeout: 90_000,
        maxRetries: 0,
        useResponsesApi: this.usesResponsesApi(runtime.base_url),
      };
      // DeepSeek réfléchit par défaut : sur une transcription, la réflexion
      // multiplie le temps par 10 et peut épuiser le budget sans réponse (mesuré).
      if (provider === 'deepseek') (chatConfig as any).modelKwargs = { thinking: { type: 'disabled' } };
      model = new ChatOpenAI(chatConfig);
      this.trackUsage(model, { provider, model: runtime.model, profile: 'vision' });
      this.models.set(cacheKey, model);
    }
    return { model, label: `${provider}/${runtime.model}` };
  }

  async testProviderConnection(provider: {
    base_url: string;
    api_key: string;
    model: string;
  }): Promise<{ ok: boolean; message: string }> {
    if (!provider.base_url || !provider.api_key || !provider.model) {
      return { ok: false, message: 'base_url, api_key et model sont requis' };
    }
    const unsafeReason = this.unsafeProviderUrlReason(provider.base_url);
    if (unsafeReason) return { ok: false, message: unsafeReason };
    try {
      const testModel = new ChatOpenAI({
        model: provider.model,
        apiKey: provider.api_key,
        configuration: { baseURL: provider.base_url },
        ...(new URL(provider.base_url).hostname === 'api.xiaomimimo.com'
          ? { modelKwargs: { max_completion_tokens: 16, thinking: { type: 'disabled' } } }
          : { maxTokens: 5 }),
        timeout: 15000,
        maxRetries: 0,
        useResponsesApi: this.usesResponsesApi(provider.base_url),
      });
      // Install token counter to avoid errors
      (testModel as any).getNumTokens = async () => 1;
      const res = await testModel.invoke([
        { role: 'user', content: 'ping' } as any,
      ]);
      const text = (res as any)?.content ?? '';
      return {
        ok: true,
        message: `Connexion OK — réponse: ${String(text).slice(0, 80)}`,
      };
    } catch (e: any) {
      const status = Number(e?.status ?? e?.response?.status ?? 0);
      const rawMessage = String(e?.message ?? e);
      if (status === 401 || status === 403) {
        return {
          ok: false,
          message: `Cle API refusee par le fournisseur (HTTP ${status})`,
        };
      }
      if (status === 404) {
        return {
          ok: false,
          message: `Modele introuvable chez le fournisseur : ${provider.model} (HTTP 404)`,
        };
      }
      if (status === 402) {
        return {
          ok: false,
          message:
            'Fournisseur facture (HTTP 402) : le compte Google AI Studio doit avoir un mode de facturation actif / des credits. Verifiez billing sur https://aistudio.google.com.',
        };
      }
      if (
        status === 503 &&
        /no candidate model|provider key|all models exhausted/i.test(rawMessage)
      ) {
        return {
          ok: false,
          message:
            'FreeLLM est joignable, mais aucun modele reel n est utilisable. Ajoutez une cle de fournisseur dans le tableau de bord FreeLLM ou attendez la reinitialisation des quotas.',
        };
      }
      const message = rawMessage.split(/\n\s*Troubleshooting URL:/i)[0].trim();
      return {
        ok: false,
        message: message || 'Connexion au fournisseur impossible',
      };
    }
  }

  unsafeProviderUrlReason(value: string): string | null {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return 'Base URL invalide';
    }
    const localDev =
      process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(localDev && url.protocol === 'http:')) {
      return 'La Base URL doit utiliser HTTPS';
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    ) {
      return 'Les adresses locales ou privees ne sont pas autorisees';
    }
    return null;
  }

  private usesResponsesApi(baseURL: string): boolean {
    return (baseURL || '')
      .toLowerCase()
      .includes('freellm.bisoft-solutions.com');
  }

  async invoke(
    profile: AiModelProfile,
    input: unknown,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ) {
    return this.getModel(profile, maxTokens, modelKwargsOverride, mode).invoke(
      input as any,
    );
  }

  async stream(
    profile: AiModelProfile,
    input: unknown,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
  ) {
    return this.getModel(profile, maxTokens, modelKwargsOverride, mode).stream(
      input as any,
    );
  }

  /**
   * Construit les `modelKwargs` de contrôle de la réflexion (« thinking ») du
   * modèle, selon un niveau demandé. Le CONTENU exact est piloté par les
   * variables d'env `AI_REASONING_KWARGS_FAST|BALANCED|PRECISE` (JSON brut),
   * pour s'adapter au paramètre réel du fournisseur sans redéploiement :
   *   AI_REASONING_KWARGS_FAST={"reasoning_effort":"low"}
   *   AI_REASONING_KWARGS_FAST={"enable_thinking":false}   // variante on/off
   * Les valeurs acceptées diffèrent d'un fournisseur à l'autre : par ordre de
   * priorité, `AI_REASONING_KWARGS_<NIVEAU>_<FOURNISSEUR>` (ex. `..._FAST_META`),
   * puis le `reasoningDefaults` du fournisseur intégré, puis la variable
   * générique. Rien de renseigné → aucun override (comportement historique).
   */
  reasoningKwargs(
    level: 'fast' | 'balanced' | 'precise',
  ): Record<string, unknown> | undefined {
    const levelKey = level.toUpperCase();
    const providerId = this.currentProviderId('quality', level);
    if (providerId) {
      const scoped = this.parseKwargsEnv(
        `AI_REASONING_KWARGS_${levelKey}_${this.envProviderKey(providerId)}`,
      );
      if (scoped) return scoped;
      const model = this.getConfiguredModel('quality', level);
      const builtin = this.compatibleBuiltinReasoningDefaults(
        providerId,
        model,
        level,
      );
      if (builtin) return { ...builtin };
    }
    return this.parseKwargsEnv(`AI_REASONING_KWARGS_${levelKey}`);
  }

  /** Lit une variable d'env contenant un objet JSON de `modelKwargs`. */
  private parseKwargsEnv(name: string): Record<string, unknown> | undefined {
    const raw = process.env[name];
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : undefined;
    } catch {
      this.logger.warn(`${name} invalide: JSON attendu`);
      return undefined;
    }
  }

  /** Fournisseur qui servira un profil pour le cabinet courant. */
  private currentProviderId(
    profile: AiModelProfile,
    mode?: AiModelMode,
  ): string {
    const tenant = this.getTenantEffectiveSync();
    return this.describeProvider(
      tenant,
      this.getBaseUrl(profile, mode, tenant),
    );
  }

  private builtinReasoningDefaults(
    providerId: string,
  ): AiProviderDefinition['reasoningDefaults'] {
    return BUILTIN_AI_PROVIDERS.find((p) => p.id === providerId)
      ?.reasoningDefaults;
  }

  private compatibleBuiltinReasoningDefaults(
    providerId: string,
    model: string,
    level: AiModelMode | 'fastProfile',
  ): Record<string, unknown> | undefined {
    const defaults = this.builtinReasoningDefaults(providerId)?.[level];
    if (!defaults) return undefined;

    const compatible = { ...defaults };
    // Z.AI ne documente `reasoning_effort` que pour GLM-5.2 et suivants.
    // GLM-5.1, GLM-5 et GLM-4.x gardent le réglage `thinking` seul.
    if (providerId === 'glm' && !/^glm-5\.[23](?:$|-)/i.test(model)) {
      delete compatible.reasoning_effort;
    }
    return compatible;
  }

  private envProviderKey(providerId: string): string {
    return providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }

  estimateTokens(input: unknown): number {
    const text = this.stringifyInput(input);
    return Math.ceil(text.length / 4);
  }

  /**
   * Résolution UNIQUE : produit la config technique et le descripteur qui la
   * décrit, à partir d'une seule lecture de la config (cabinet puis ENV).
   * Toute la vérité du log vient d'ici — jamais d'une seconde résolution.
   */
  private resolve(
    profile: AiModelProfile,
    maxTokens?: number,
    modelKwargsOverride?: Record<string, unknown>,
    mode?: AiModelMode,
    effectiveOverride?: TenantAiEffective | null,
  ): { config: ModelProfileConfig; descriptor: AiModelDescriptor } {
    const tenantEffective = effectiveOverride === undefined ? this.getTenantEffectiveSync() : effectiveOverride;
    const model = this.getConfiguredModel(profile, mode, tenantEffective);
    const baseURL = this.getBaseUrl(profile, mode, tenantEffective);
    const apiKey = this.getApiKey(profile, mode, tenantEffective);
    const providerId = this.describeProvider(tenantEffective, baseURL);

    const defaults: Record<AiModelProfile, number> = {
      fast: 300,
      quality: 900,
      streaming: 1400,
    };

    const resolvedMaxTokens =
      maxTokens ??
      this.getProfileNumber(profile, 'MAX_TOKENS', defaults[profile]);
    const temperature = this.getProfileNumber(
      profile,
      'TEMPERATURE',
      Number(process.env.AI_TEMPERATURE || 0),
    );
    const streaming = profile === 'streaming';

    const config: ModelProfileConfig = {
      model,
      maxTokens: resolvedMaxTokens,
      streaming,
      timeout: this.getProfileNumber(
        profile,
        'TIMEOUT_MS',
        Number(process.env.AI_TIMEOUT_MS || 35000),
      ),
      maxRetries: this.getProfileNumber(
        profile,
        'MAX_RETRIES',
        Number(process.env.AI_MAX_RETRIES ?? 2),
      ),
      temperature,
      apiKey,
      baseURL,
      modelKwargs: this.mergeModelKwargs(
        this.getModelKwargs(profile, providerId, model),
        modelKwargsOverride,
      ),
      useResponsesApi: this.usesResponsesApi(baseURL),
    };

    const descriptor: AiModelDescriptor = {
      profile,
      mode: mode ?? this.defaultModeFor(profile),
      provider: providerId,
      model,
      baseURL,
      source: tenantEffective ? 'tenant' : 'env',
      tenantId: hasActiveTenant() ? getCurrentTenantId() : null,
      hasApiKey: !!apiKey,
      streaming,
      maxTokens: resolvedMaxTokens,
      temperature,
    };

    return { config, descriptor };
  }

  /** Mode implicite quand l'appelant n'en fournit pas (log lisible). */
  private defaultModeFor(profile: AiModelProfile): AiModelMode {
    return profile === 'quality'
      ? 'balanced'
      : profile === 'streaming'
        ? 'balanced'
        : 'fast';
  }

  /** Nom du fournisseur : déclaré par le cabinet, sinon déduit de l'URL. */
  private describeProvider(
    tenant: TenantAiEffective | null,
    baseURL: string,
  ): string {
    if (tenant?.providerId) return tenant.providerId;
    const url = (baseURL || '').toLowerCase();
    if (url.includes('deepseek')) return 'deepseek';
    if (url.includes('xiaomimimo.com')) return 'mimo';
    if (url.includes('meta.ai')) return 'meta';
    if (url.includes('freellm') || url.includes('bisoft')) return 'freellm';
    if (url.includes('openai')) return 'openai';
    if (url.includes('anthropic')) return 'anthropic';
    if (url.includes('googleapis') || url.includes('generativelanguage'))
      return 'google';
    return 'custom';
  }

  /**
   * Le profil décrit l'usage technique (petite réponse, plan/SQL, streaming),
   * tandis que le mode demandé par le chat choisit réellement la gamme du
   * modèle : rapide/équilibré sur Flash, précis sur Pro.
   * Si une config tenant est présente, elle prime sur les env vars.
   */
  private getConfiguredModel(
    profile: AiModelProfile,
    mode?: AiModelMode,
    tenant?: TenantAiEffective | null,
  ): string {
    const t = tenant ?? this.getTenantEffectiveSync();

    // Tenant override : modèle unique ou par profil
    if (t) {
      if (profile === 'fast' && t.fastModel) return t.fastModel;
      if (profile === 'quality' && t.qualityModel) return t.qualityModel;
      if (profile === 'streaming' && t.streamingModel) return t.streamingModel;
      if (t.model) return t.model;
      // Si tenant a un model défini au niveau provider, on l'utilise même sans profil spécifique
    }

    if (mode === 'precise') {
      return (
        process.env.AI_PRECISE_MODEL ||
        process.env.AI_QUALITY_MODEL ||
        process.env.AI_MODEL ||
        'deepseek-v4-pro'
      );
    }

    if (mode === 'fast' || mode === 'balanced') {
      return (
        process.env.AI_FLASH_MODEL ||
        process.env.AI_FAST_MODEL ||
        process.env.AI_MODEL ||
        'deepseek-v4-flash'
      );
    }

    return profile === 'fast'
      ? process.env.AI_FAST_MODEL || process.env.AI_MODEL || 'deepseek-v4-flash'
      : profile === 'streaming'
        ? process.env.AI_STREAM_MODEL ||
          process.env.AI_MODEL ||
          'deepseek-v4-flash'
        : process.env.AI_QUALITY_MODEL ||
          process.env.AI_MODEL ||
          'deepseek-v4-flash';
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

  private getApiKey(
    profile: AiModelProfile,
    mode?: AiModelMode,
    tenant?: TenantAiEffective | null,
  ): string | undefined {
    const t = tenant ?? this.getTenantEffectiveSync();
    // A configured external endpoint must never inherit another provider's secret.
    if (t) return t.apiKey;

    if (mode) {
      return (
        process.env.DEEPSEEK_API_KEY ||
        process.env.AI_API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }

    if (profile === 'fast') {
      return (
        process.env.AI_FAST_API_KEY ||
        process.env.DEEPSEEK_API_KEY ||
        process.env.AI_API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }

    if (profile === 'quality') {
      return (
        process.env.AI_QUALITY_API_KEY ||
        process.env.DEEPSEEK_API_KEY ||
        process.env.AI_API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }

    return (
      process.env.AI_STREAM_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.GLM_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY
    );
  }

  private getBaseUrl(
    profile: AiModelProfile,
    mode?: AiModelMode,
    tenant?: TenantAiEffective | null,
  ): string {
    const t = tenant ?? this.getTenantEffectiveSync();
    if (t?.baseURL) return t.baseURL;

    if (mode) {
      return (
        process.env.AI_DEEPSEEK_BASE_URL ||
        process.env.AI_BASE_URL ||
        'https://api.deepseek.com'
      );
    }

    if (profile === 'fast') {
      return (
        process.env.AI_FAST_BASE_URL ||
        process.env.AI_DEEPSEEK_BASE_URL ||
        process.env.AI_BASE_URL ||
        'https://api.deepseek.com'
      );
    }

    if (profile === 'quality') {
      return (
        process.env.AI_QUALITY_BASE_URL ||
        process.env.AI_DEEPSEEK_BASE_URL ||
        process.env.AI_BASE_URL ||
        'https://api.deepseek.com'
      );
    }

    return (
      process.env.AI_STREAM_BASE_URL ||
      process.env.AI_DEEPSEEK_BASE_URL ||
      process.env.AI_GLM_BASE_URL ||
      process.env.AI_BASE_URL ||
      'https://api.deepseek.com'
    );
  }

  // ── Tenant config helpers ────────────────────────────────────────────

  private getTenantEffectiveSync(): TenantAiEffective | null {
    if (!hasActiveTenant() || !this.dataSource) return null;
    const tenantId = getCurrentTenantId();
    const cached = this.tenantConfigCache.get(tenantId);
    const isStale = !cached || Date.now() - cached.ts > this.TENANT_CACHE_TTL;
    if (isStale) {
      // fire-and-forget refresh
      this.loadTenantConfigAsync(tenantId).catch(() => {});
      if (cached) return this.resolveTenantEffective(cached.config);
      return null;
    }
    return this.resolveTenantEffective(cached.config);
  }

  private resolveTenantEffective(raw: any): TenantAiEffective | null {
    if (!raw || typeof raw !== 'object') return null;
    const active = raw.active_provider as string | undefined;
    let providerCfg: any = null;
    let providerId: string | undefined = active;

    if (active && raw.providers?.[active]) {
      providerCfg = raw.providers[active];
    } else if (active && this.isBuiltinProvider(active)) {
      // Pour les fournisseurs integres, la base URL et la cle peuvent vivre
      // uniquement dans l'environnement. Le cabinet ne stocke alors que le
      // fournisseur actif et, eventuellement, le modele choisi.
      providerCfg = {};
    } else if (
      raw.providers &&
      typeof raw.providers === 'object' &&
      Object.keys(raw.providers).length > 0
    ) {
      // Si un seul provider configuré et pas d'active_provider, l'utiliser
      const keys = Object.keys(raw.providers);
      if (keys.length === 1) {
        providerCfg = raw.providers[keys[0]];
        providerId = providerId ?? keys[0];
      } else if (active) {
        providerCfg = raw.providers[active];
      }
    }

    // Fallback : config à plat (legacy / custom unique)
    if (!providerCfg && (raw.base_url || raw.api_key || raw.model)) {
      providerCfg = raw;
      providerId = providerId ?? 'custom';
    }

    if (!providerCfg) return null;

    const runtime = this.getProviderRuntimeConfig(
      providerId ?? 'custom',
      providerCfg,
    );
    if (!runtime) return null;

    return {
      baseURL: runtime.base_url,
      apiKey: runtime.api_key,
      model: runtime.model,
      fastModel: (providerCfg.fast_model ?? providerCfg.fastModel) || undefined,
      qualityModel:
        (providerCfg.quality_model ?? providerCfg.qualityModel) || undefined,
      streamingModel:
        (providerCfg.streaming_model ?? providerCfg.streamingModel) ||
        undefined,
      providerId: providerId || undefined,
    };
  }

  private getProviderEnvApiKey(providerId: string): string | undefined {
    if (providerId === 'mimo') return process.env.MIMO_API_KEY;
    if (providerId === 'meta') return process.env.META_API_KEY;
    if (providerId === 'freellm') return process.env.FREELLM_API_KEY;
    if (providerId === 'google') {
      return (
        process.env.GOOGLE_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.AI_API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }
    if (providerId === 'deepseek') {
      return (
        process.env.DEEPSEEK_API_KEY ||
        process.env.AI_API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }
    if (providerId === 'glm') return process.env.GLM_API_KEY;
    return undefined;
  }

  private getProviderEnvBaseUrl(providerId: string): string | undefined {
    if (providerId === 'mimo') return process.env.MIMO_BASE_URL;
    if (providerId === 'meta') return process.env.META_BASE_URL;
    if (providerId === 'freellm') return process.env.FREELLM_BASE_URL;
    if (providerId === 'google') {
      return process.env.GOOGLE_BASE_URL;
    }
    if (providerId === 'deepseek') {
      return process.env.AI_DEEPSEEK_BASE_URL || process.env.AI_BASE_URL;
    }
    if (providerId === 'glm') {
      return process.env.AI_GLM_BASE_URL || process.env.GLM_BASE_URL;
    }
    return undefined;
  }

  /**
   * Configuration IA effective d'un cabinet : exception posée par la
   * plateforme pour ce cabinet, sinon moteur par défaut de la plateforme
   * (`platform_settings['ai']`), sinon `null` → variables d'environnement.
   */
  private async loadTenantConfig(tenantId: number): Promise<any | null> {
    if (!this.dataSource) return null;
    try {
      // Use query runner to avoid repository tenant patch
      const rows: any[] = await this.dataSource.query(
        'SELECT c.ai_config, p.ai_policy FROM cabinets c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ? LIMIT 1',
        [tenantId],
      );
      const cabinet = parseStoredAiConfig(rows?.[0]?.ai_config);
      const platform = await this.loadPlatformConfig();
      return resolveSubscriptionAiConfig(platform, cabinet, readAiPlanPolicy(rows?.[0]?.ai_policy));
    } catch (e) {
      this.logger.warn(
        `loadTenantConfig #${tenantId} échoué: ${(e as Error).message}`,
      );
      throw new ServiceUnavailableException('Impossible de vérifier la configuration IA de votre abonnement');
    }
  }

  /** Configuration IA de la plateforme (catalogue + moteur par défaut), en cache. */
  async loadPlatformConfig(): Promise<AiStoredConfig | null> {
    if (!this.dataSource) return null;
    const cached = this.platformConfigCache;
    if (cached && Date.now() - cached.ts < this.TENANT_CACHE_TTL) {
      return cached.config;
    }
    try {
      const rows: any[] = await this.dataSource.query(
        'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
        [PLATFORM_AI_SETTING_KEY],
      );
      const config = parseStoredAiConfig(rows?.[0]?.value);
      this.platformConfigCache = { config, ts: Date.now() };
      return config;
    } catch (e) {
      this.logger.warn(
        `Lecture de la config IA plateforme échouée: ${(e as Error).message}`,
      );
      return cached?.config ?? null;
    }
  }

  private async loadTenantConfigAsync(tenantId: number): Promise<void> {
    if (this.loadingPromises.has(tenantId))
      return this.loadingPromises.get(tenantId)!;
    const p = (async () => {
      const cfg = await this.loadTenantConfig(tenantId);
      this.tenantConfigCache.set(tenantId, { config: cfg, ts: Date.now() });
    })();
    this.loadingPromises.set(tenantId, p);
    try {
      await p;
    } finally {
      this.loadingPromises.delete(tenantId);
    }
  }

  private getProfileNumber(
    profile: AiModelProfile,
    suffix: string,
    fallback: number,
  ): number {
    const profileKey =
      profile === 'streaming' ? 'STREAM' : profile.toUpperCase();
    const raw = process.env[`AI_${profileKey}_${suffix}`];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  private getModelKwargs(
    profile: AiModelProfile,
    providerId?: string,
    model?: string,
  ): Record<string, unknown> | undefined {
    const profileKey =
      profile === 'streaming' ? 'STREAM' : profile.toUpperCase();
    // Réglage propre au fournisseur d'abord (ex. AI_META_FAST_MODEL_KWARGS),
    // puis, pour le profil `fast`, le défaut du fournisseur intégré.
    if (providerId) {
      const scoped = this.parseKwargsEnv(
        `AI_${this.envProviderKey(providerId)}_${profileKey}_MODEL_KWARGS`,
      );
      if (scoped) return scoped;
      const builtin = profile === 'fast'
        ? this.compatibleBuiltinReasoningDefaults(
            providerId,
            model ?? '',
            'fastProfile',
          )
        : undefined;
      if (builtin) return { ...builtin };
    }
    const raw =
      process.env[`AI_${profileKey}_MODEL_KWARGS`] ||
      process.env.AI_MODEL_KWARGS;
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : undefined;
    } catch {
      this.logger.warn(`AI_${profileKey}_MODEL_KWARGS invalide: JSON attendu`);
      return undefined;
    }
  }

  private stringifyInput(input: unknown): string {
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      return input
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'content' in item) {
            return String(item.content ?? '');
          }
          return JSON.stringify(item);
        })
        .join('\n');
    }
    try {
      return JSON.stringify(input);
    } catch {
      return String(input ?? '');
    }
  }

  /**
   * Reçoit la consommation de chaque appel de modèle construit ici (chat,
   * lecture d'images, assistant de la plateforme) : tokens renvoyés par le
   * fournisseur, ou estimés quand il ne les donne pas.
   */
  onUsage(listener: (event: AiUsageEvent) => void): void {
    this.usageListener = listener;
  }

  /** Consommation d'un appel fait sans ChatOpenAI (transcription audio). */
  reportUsage(
    info: { provider: string; model: string; profile: string },
    usage: { input?: number; output?: number },
    fallback: { inputChars: number; outputChars: number },
  ): void {
    if (!this.usageListener) return;
    try {
      this.usageListener({
        ...info,
        inputTokens: usage.input ?? estimateTokensFromChars(fallback.inputChars),
        outputTokens: usage.output ?? estimateTokensFromChars(fallback.outputChars),
        cachedInputTokens: 0,
        reasoningTokens: 0,
        estimated: usage.input === undefined || usage.output === undefined,
      });
    } catch (error) {
      this.logger.warn(`Suivi de consommation IA : ${(error as Error).message}`);
    }
  }

  /**
   * Modèle de transcription audio (chat/completions avec `input_audio`).
   * `AI_ASR_MODEL` (+ `AI_ASR_PROVIDER`, ou `AI_ASR_BASE_URL` / `AI_ASR_API_KEY`)
   * l'impose ; sinon AssemblyAI dès que `ASSEMBLYAI_API_KEY` est renseignée
   * (service de transcription dédié, intervenants repérés), sinon Gemini dès
   * que sa clé est configurée (il comprend le français, contrairement à
   * MiMo ASR : chinois et anglais seulement).
   * null : la transcription n'est pas disponible.
   */
  getTranscriptionRuntime(): (AiProviderRuntimeConfig & { provider: string; label: string }) | null {
    const envModel = process.env.AI_ASR_MODEL?.trim();
    let provider = '';
    let runtime: AiProviderRuntimeConfig | null = null;
    const assemblyKey = process.env.ASSEMBLYAI_API_KEY?.trim();
    const envProvider = process.env.AI_ASR_PROVIDER?.trim().toLowerCase();
    if (envProvider === 'assemblyai' || (!envProvider && assemblyKey && !process.env.AI_ASR_BASE_URL?.trim())) {
      // AssemblyAI : son propre protocole (envoi du fichier, puis suivi de la transcription).
      provider = 'assemblyai';
      runtime = {
        base_url: process.env.ASSEMBLYAI_BASE_URL?.trim() || 'https://api.assemblyai.com',
        api_key: assemblyKey || process.env.AI_ASR_API_KEY?.trim() || undefined,
        model: envModel || 'universal-3-5-pro',
      };
    } else if (envModel && process.env.AI_ASR_BASE_URL?.trim()) {
      provider = process.env.AI_ASR_PROVIDER?.trim() || 'custom';
      runtime = {
        base_url: process.env.AI_ASR_BASE_URL.trim(),
        api_key: process.env.AI_ASR_API_KEY?.trim() || undefined,
        model: envModel,
      };
    } else {
      provider = process.env.AI_ASR_PROVIDER?.trim() || 'google';
      runtime = this.getProviderRuntimeConfig(provider, { model: envModel || (provider === 'google' ? 'gemini-2.5-flash' : undefined) });
    }
    if (!runtime?.api_key || !runtime.base_url || !runtime.model) return null;
    const unsafeReason = this.unsafeProviderUrlReason(runtime.base_url);
    if (unsafeReason) {
      this.logger.warn(`Modèle de transcription ignoré : ${unsafeReason}`);
      return null;
    }
    return { ...runtime, provider, label: `${provider}/${runtime.model}` };
  }

  /**
   * Enveloppe `invoke` et `stream` de l'instance : l'usage est lu dans la
   * réponse (ou le dernier fragment du flux, `streamUsage` étant actif) et
   * transmis dans le contexte de l'appelant, qui sait à quelle requête il
   * appartient. Un appel en échec n'est pas compté.
   */
  private trackUsage(
    model: ChatOpenAI,
    info: { provider: string; model: string; profile: string },
  ): void {
    const report = (input: unknown, usage: ProviderUsage | null, outputChars: number) => {
      if (!this.usageListener) return;
      try {
        this.usageListener({
          ...info,
          inputTokens: usage?.input ?? this.estimateTokens(input),
          outputTokens: usage?.output ?? estimateTokensFromChars(outputChars),
          cachedInputTokens: usage?.cached ?? 0,
          reasoningTokens: usage?.reasoning ?? 0,
          estimated: !usage,
        });
      } catch (error) {
        this.logger.warn(`Suivi de consommation IA : ${(error as Error).message}`);
      }
    };
    const invoke = model.invoke.bind(model);
    const stream = model.stream.bind(model);
    Object.assign(model, {
      invoke: async (input: any, options?: any) => {
        const response = await invoke(input, options);
        report(input, readUsageMetadata(response?.usage_metadata), contentLength(response?.content));
        return response;
      },
      stream: async (input: any, options?: any) => {
        const source = await stream(input, options);
        return (async function* () {
          let usage: ProviderUsage | null = null;
          let chars = 0;
          try {
            for await (const chunk of source) {
              usage = readUsageMetadata((chunk as any)?.usage_metadata) ?? usage;
              chars += contentLength((chunk as any)?.content);
              yield chunk;
            }
          } finally {
            // Flux interrompu (arrêt, brouillon SQL abandonné) : ce qui a été lu est estimé.
            report(input, usage, chars);
          }
        })();
      },
    });
  }

  private installApproximateTokenCounter(model: ChatOpenAI) {
    const getNumTokens = async (content: unknown): Promise<number> => {
      const text = this.stringifyInput(content);
      return Math.ceil(text.length / 4);
    };
    (
      model as ChatOpenAI & {
        getNumTokens: (content: unknown) => Promise<number>;
      }
    ).getNumTokens = getNumTokens;
  }
}
