import { AiModelRouterService } from './ai-model-router.service';
import { TenantContext } from '../tenant/tenant.context';

describe('Xiaomi MiMo', () => {
  it('ne réutilise pas une clé d’un autre fournisseur quand la clé attribuée est absente', () => {
    const router = new AiModelRouterService();
    expect(() => router.getModelWithDescriptor('quality', 100, undefined, 'fast', {
      providerId: 'mimo', model: 'mimo-v2.6-flash', baseURL: 'https://api.xiaomimimo.com/v1',
    })).toThrow('La clé du moteur IA attribué est indisponible');
  });
  it('actualise le catalogue et exclut les modèles réservés aux endpoints audio', async () => {
    const original = global.fetch;
    const mock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'mimo-v2.6-flash' },
          { id: 'mimo-v2.6-pro' },
          { id: 'mimo-v2.6-pro-ultraspeed' },
          { id: 'mimo-v2.5-pro' },
          { id: 'mimo-v2.5' },
          { id: 'mimo-v2.5-asr' },
          { id: 'mimo-v2.5-tts-voiceclone' },
        ],
      }),
    })) as any;
    global.fetch = mock;
    try {
      const router = new AiModelRouterService();
      const models = await router.listAvailableModels('mimo', {
        base_url: 'https://api.xiaomimimo.com/v1',
        model: 'mimo-v2.6-flash',
        api_key: 'test-key',
      });
      expect(models).toHaveLength(5);
      const complete = await router.listAvailableModels('mimo', { base_url: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.6-flash', api_key: 'test-key' }, true);
      expect(complete).toHaveLength(7);
      expect(complete).toContain('mimo-v2.5-asr');
      expect(models).toContain('mimo-v2.6-pro-ultraspeed');
      expect(mock).toHaveBeenCalledWith(
        'https://api.xiaomimimo.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        }),
      );
    } finally {
      global.fetch = original;
    }
  });
  it('utilise le secret MiMo du serveur, le modèle attribué et max_completion_tokens', async () => {
    const original = process.env.MIMO_API_KEY;
    process.env.MIMO_API_KEY = 'mimo-server-secret';
    const db = {
      query: jest.fn(async (sql: string) =>
        sql.includes('platform_settings')
          ? []
          : [
              {
                ai_config: null,
                ai_policy: {
                  default_model: {
                    provider_id: 'mimo',
                    model: 'mimo-v2.6-pro',
                  },
                },
              },
            ],
      ),
    } as any;
    try {
      const router = new AiModelRouterService(db);
      await new TenantContext().run(7, async () => {
        await router.ensureTenantConfigLoaded();
        for (const mode of ['fast', 'balanced', 'precise'] as const) {
          const result = router.getModelWithDescriptor(
            'quality',
            300,
            router.reasoningKwargs(mode),
            mode,
          );
          expect(result.descriptor).toMatchObject({
            provider: 'mimo',
            model: 'mimo-v2.6-pro',
          });
          expect((result.model as any).clientConfig.apiKey).toBe(
            'mimo-server-secret',
          );
          expect((result.model as any).modelKwargs.max_completion_tokens).toBe(
            300,
          );
        }
      });
    } finally {
      if (original === undefined) delete process.env.MIMO_API_KEY;
      else process.env.MIMO_API_KEY = original;
    }
  });
});
