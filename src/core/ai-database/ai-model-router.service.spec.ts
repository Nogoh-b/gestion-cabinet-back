import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { AiModelRouterService } from './ai-model-router.service';
import { TenantContext } from '../tenant/tenant.context';

/** Config IA d'un cabinet utilisant la passerelle FreeLLM. */
const FREELM_AI_CONFIG = {
  active_provider: 'freellm',
  providers: {
    freellm: {
      base_url: 'https://freellm.bisoft-solutions.com/v1',
      api_key: 'freellmapi-test-key',
      model: 'multi-models',
    },
  },
};

const META_AI_CONFIG_WITH_SERVER_SECRET = {
  active_provider: 'meta',
  providers: {
    meta: {
      base_url: 'https://api.meta.ai',
      api_key: 'stale-stored-key',
      model: 'muse-spark-1.3-contributor',
    },
  },
};

/** Faux DataSource : ne sert qu'à `SELECT ai_config FROM cabinets`. */
function fakeDataSource(aiConfig: unknown) {
  return {
    query: jest.fn(async () => [{ ai_config: aiConfig }]),
  } as any;
}

describe('AiModelRouterService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses configurable model names per profile', () => {
    process.env.AI_FAST_MODEL = 'fast-model';
    process.env.AI_QUALITY_MODEL = 'quality-model';
    process.env.AI_STREAM_MODEL = 'stream-model';

    const service = new AiModelRouterService();

    expect(service.getModelName('fast')).toBe('fast-model');
    expect(service.getModelName('quality')).toBe('quality-model');
    expect(service.getModelName('streaming')).toBe('stream-model');
  });

  it('uses DeepSeek Flash for all profiles by default', () => {
    delete process.env.AI_MODEL;
    delete process.env.AI_FAST_MODEL;
    delete process.env.AI_QUALITY_MODEL;
    delete process.env.AI_STREAM_MODEL;
    delete process.env.AI_FLASH_MODEL;
    delete process.env.AI_PRECISE_MODEL;

    const service = new AiModelRouterService();

    expect(service.getModelName('fast')).toBe('deepseek-v4-flash');
    expect(service.getModelName('quality')).toBe('deepseek-v4-flash');
    expect(service.getModelName('streaming')).toBe('deepseek-v4-flash');
  });

  it('routes fast and balanced modes to Flash, and precise mode to Pro', () => {
    process.env.AI_FLASH_MODEL = 'deepseek-flash-test';
    process.env.AI_PRECISE_MODEL = 'deepseek-pro-test';

    const service = new AiModelRouterService();

    expect(service.getModelName('quality', 'fast')).toBe('deepseek-flash-test');
    expect(service.getModelName('streaming', 'balanced')).toBe(
      'deepseek-flash-test',
    );
    expect(service.getModelName('fast', 'precise')).toBe('deepseek-pro-test');
  });

  it('chiffre les cles des fournisseurs personnalises au repos', () => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = 'test-encryption-key';
    const service = new AiModelRouterService();
    const encrypted = service.protectApiKey('custom-secret-value');

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain('custom-secret-value');
    expect(
      service.getProviderRuntimeConfig('custom_demo', {
        base_url: 'https://llm.example.com/v1',
        model: 'demo-model',
        api_key: encrypted,
      })?.api_key,
    ).toBe('custom-secret-value');
  });

  it('charge le catalogue FreeLLM depuis /v1/models', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'auto', available: true },
          { id: 'deepseek-v4-flash', available: true },
          { id: 'glm-5.3', available: false, unavailable_reason: 'no_key' },
          { id: 'auto', available: true },
        ],
      }),
    })) as any;
    global.fetch = fetchMock;

    try {
      const service = new AiModelRouterService();
      const models = await service.listAvailableModels('freellm', {
        base_url: 'https://freellm.bisoft-solutions.com/v1',
        api_key: 'freellm-test-key',
        model: 'auto',
      });

      expect(models).toEqual(['auto', 'deepseek-v4-flash']);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://freellm.bisoft-solutions.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer freellm-test-key',
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── Véracité du log [AI-MODEL] ─────────────────────────────────────────────

  describe('descripteur de modèle (source du log)', () => {
    it('décrit exactement le client réellement construit (modèle, URL, clé)', () => {
      delete process.env.AI_QUALITY_API_KEY;
      process.env.AI_QUALITY_MODEL = 'env-quality-model';
      process.env.AI_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
      process.env.DEEPSEEK_API_KEY = 'sk-env-key';

      const service = new AiModelRouterService();
      // Sans mode explicite, le profil `quality` suit AI_QUALITY_MODEL.
      const { model, descriptor } = service.getModelWithDescriptor(
        'quality',
        777,
      );

      // Ce que le log annonce…
      expect(descriptor).toMatchObject({
        profile: 'quality',
        mode: 'balanced',
        provider: 'deepseek',
        model: 'env-quality-model',
        baseURL: 'https://api.deepseek.com',
        source: 'env',
        hasApiKey: true,
        streaming: false,
        maxTokens: 777,
      });

      // …correspond au client OpenAI effectivement utilisé.
      expect((model as any).model).toBe(descriptor.model);
      expect((model as any).clientConfig.baseURL).toBe(descriptor.baseURL);
      expect((model as any).clientConfig.apiKey).toBe('sk-env-key');

      // Le descripteur est sérialisable tel quel dans une ligne de log.
      const line = service.formatDescriptor(descriptor);
      expect(line).toContain('provider=deepseek');
      expect(line).toContain('model=env-quality-model');
      expect(line).toContain('source=env');
      expect(line).toContain('cle=oui');
    });

    it('la config du cabinet prime sur les ENV, et le log indique la bonne origine', async () => {
      delete process.env.AI_QUALITY_API_KEY;
      process.env.AI_QUALITY_MODEL = 'env-quality-model';
      process.env.DEEPSEEK_API_KEY = 'sk-env-key';
      process.env.FREELLM_API_KEY = 'freellm-server-key';

      const service = new AiModelRouterService(
        fakeDataSource(FREELM_AI_CONFIG),
      );
      const tenant = new TenantContext();

      await tenant.run(22, async () => {
        // Préchargement obligatoire : sans lui, la résolution est synchrone et
        // retomberait sur les ENV (voir le test suivant).
        await service.ensureTenantConfigLoaded();

        const { model, descriptor } = service.getModelWithDescriptor(
          'quality',
          500,
          undefined,
          'balanced',
        );

        expect(descriptor).toMatchObject({
          provider: 'freellm',
          model: 'auto',
          baseURL: 'https://freellm.bisoft-solutions.com/v1',
          source: 'tenant',
          tenantId: 22,
          hasApiKey: true,
        });

        // Le fournisseur et le modèle viennent du cabinet, mais le secret du
        // fournisseur intégré reste exclusivement dans les ENV serveur.
        expect((model as any).clientConfig.apiKey).toBe('freellm-server-key');
        expect((model as any).clientConfig.apiKey).not.toBe(
          'freellmapi-test-key',
        );
        expect((model as any).model).toBe('auto');
        expect((model as any).useResponsesApi).toBe(true);
        expect((model as any).clientConfig.baseURL).toBe(
          'https://freellm.bisoft-solutions.com/v1',
        );
      });
    });

    it('garde la clé Meta côté serveur quand le cabinet ne stocke que le modèle', async () => {
      process.env.META_API_KEY = 'meta-server-key';
      process.env.DEEPSEEK_API_KEY = 'deepseek-server-key';

      const service = new AiModelRouterService(
        fakeDataSource(META_AI_CONFIG_WITH_SERVER_SECRET),
      );
      const tenant = new TenantContext();

      await tenant.run(42, async () => {
        await service.ensureTenantConfigLoaded();
        const { model, descriptor } = service.getModelWithDescriptor('quality');

        expect(descriptor).toMatchObject({
          provider: 'meta',
          model: 'muse-spark-1.3-contributor',
          baseURL: 'https://api.meta.ai/v1',
          source: 'tenant',
          tenantId: 42,
          hasApiKey: true,
        });
        expect((model as any).clientConfig.apiKey).toBe('meta-server-key');
        expect((model as any).clientConfig.apiKey).not.toBe('stale-stored-key');
        expect((model as any).clientConfig.apiKey).not.toBe(
          'deepseek-server-key',
        );
      });
    });

    it('sans préchargement, la résolution retombe sur les ENV (justifie ensureTenantConfigLoaded)', async () => {
      delete process.env.AI_QUALITY_API_KEY;
      process.env.AI_QUALITY_MODEL = 'env-quality-model';
      process.env.DEEPSEEK_API_KEY = 'sk-env-key';

      const service = new AiModelRouterService(
        fakeDataSource(FREELM_AI_CONFIG),
      );
      const tenant = new TenantContext();

      await tenant.run(22, async () => {
        // Cache froid : la lecture est asynchrone, donc pas encore disponible.
        expect(service.describe('quality', 'balanced').source).toBe('env');

        await service.ensureTenantConfigLoaded();

        // Cache chaud : la config du cabinet s'applique, sans changer de tour.
        expect(service.describe('quality', 'balanced').source).toBe('tenant');
      });
    });

    it("signale l'absence de clé API (log d'avertissement, pas de fausse réussite)", () => {
      delete process.env.AI_QUALITY_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.AI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GLM_API_KEY;
      process.env.AI_QUALITY_MODEL = 'sans-cle';

      const service = new AiModelRouterService();
      const descriptor = service.describe('quality', 'balanced');

      expect(descriptor.hasApiKey).toBe(false);
      expect(service.formatDescriptor(descriptor)).toContain('cle=NON');
    });
  });
});
