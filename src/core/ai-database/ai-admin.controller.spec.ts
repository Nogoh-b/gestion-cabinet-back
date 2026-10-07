import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { AiAdminController } from './ai-admin.controller';
import { AiModelRouterService } from './ai-model-router.service';

describe('AiAdminController', () => {
  const originalEnv = process.env;
  let settings: {
    getAiConfig: jest.Mock;
    saveAiConfig: jest.Mock;
  };
  let router: AiModelRouterService;
  let controller: AiAdminController;

  const adminRequest = {
    user: { role: 'admin', tenantId: 7, permissions: [] },
  } as any;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      META_API_KEY: 'meta-secret-from-server',
      FREELLM_API_KEY: 'freellm-secret-from-server',
      DEEPSEEK_API_KEY: 'deepseek-secret-from-server',
    };
    settings = {
      getAiConfig: jest.fn(async () => null),
      saveAiConfig: jest.fn(
        async (_tenantId: number, config: unknown) => config,
      ),
    };
    router = new AiModelRouterService();
    jest
      .spyOn(router, 'listAvailableModels')
      .mockImplementation(async (providerId, runtime) => {
        if (providerId === 'freellm') return ['auto', 'deepseek-v4-flash'];
        return (
          router.getBuiltinProvider(providerId)?.models ??
          (runtime?.model ? [runtime.model] : [])
        );
      });
    controller = new AiAdminController(router, settings as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('ne renvoie jamais les cles API au navigateur', async () => {
    (settings.getAiConfig as any).mockResolvedValue({
      active_provider: 'custom_demo',
      providers: {
        custom_demo: {
          label: 'Demo',
          base_url: 'https://llm.example.com/v1',
          model: 'demo-model',
          api_key: 'custom-super-secret',
          is_custom: true,
        },
      },
    });

    const result = await controller.listProviders(adminRequest);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('custom-super-secret');
    expect(serialized).not.toContain('meta-secret-from-server');
    expect(
      result.providers.find((provider) => provider.id === 'custom_demo'),
    ).toMatchObject({
      has_api_key: true,
      selected_model: 'demo-model',
    });
    expect(
      result.providers.find((provider) => provider.id === 'freellm'),
    ).toMatchObject({
      models: ['auto', 'deepseek-v4-flash'],
      selected_model: 'auto',
    });
  });

  it('enregistre uniquement le fournisseur et le modele lors de la selection Meta', async () => {
    const result = await controller.activateProvider(adminRequest, {
      provider_id: 'meta',
      model: 'muse-spark-1.3-contributor',
    });

    expect(result).toMatchObject({
      ok: true,
      active_provider: 'meta',
      model: 'muse-spark-1.3-contributor',
      has_api_key: true,
    });
    expect(settings.saveAiConfig).toHaveBeenCalledWith(7, {
      active_provider: 'meta',
      providers: {
        meta: {
          model: 'muse-spark-1.3-contributor',
        },
      },
    });
  });

  it('refuse l acces a un utilisateur non administrateur', async () => {
    await expect(
      controller.listProviders({
        user: { role: 'avocat', tenantId: 7, permissions: [] },
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
