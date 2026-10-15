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

/** Base factice : `cabinets.ai_config` et `platform_settings['ai']`. */
function fakeDb(state: { cabinet: unknown; platform: unknown }) {
  return {
    query: jest.fn(async (sql: string) =>
      sql.includes('platform_settings')
        ? state.platform == null ? [] : [{ value: JSON.stringify(state.platform) }]
        : [{ ai_config: state.cabinet == null ? null : JSON.stringify(state.cabinet) }],
    ),
  };
}

describe('AiAdminController (vue cabinet, lecture seule)', () => {
  const originalEnv = process.env;
  const adminRequest = { user: { role: 'admin', tenantId: 7, permissions: [] } } as any;
  let state: { cabinet: unknown; platform: unknown };
  let controller: AiAdminController;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      META_API_KEY: 'meta-secret-from-server',
      DEEPSEEK_API_KEY: 'deepseek-secret-from-server',
    };
    state = { cabinet: null, platform: null };
    const router = new AiModelRouterService(fakeDb(state) as any);
    const settings = { getAiConfig: jest.fn(async () => state.cabinet) };
    controller = new AiAdminController(router, settings as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('indique le moteur par défaut de la plateforme', async () => {
    state.platform = { active_provider: 'meta', providers: { meta: { model: 'muse-spark-1.3-contributor' } } };

    const result = await controller.status(adminRequest);

    expect(result).toMatchObject({
      managed_by: 'platform',
      source: 'platform',
      provider_id: 'meta',
      provider_label: 'Meta AI (Muse)',
      model: 'muse-spark-1.3-contributor',
      has_api_key: true,
    });
  });

  it("signale l'exception posée par la plateforme pour ce cabinet, sans jamais exposer de clé", async () => {
    state.platform = {
      active_provider: 'deepseek',
      providers: {
        custom_demo: {
          label: 'Demo',
          base_url: 'https://llm.example.com/v1',
          model: 'demo-model',
          api_key: 'custom-super-secret',
          is_custom: true,
        },
      },
    };
    state.cabinet = { active_provider: 'custom_demo', providers: { custom_demo: { model: 'demo-model' } } };

    const result = await controller.status(adminRequest);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({ source: 'cabinet', provider_id: 'custom_demo', provider_label: 'Demo', model: 'demo-model', has_api_key: true });
    expect(serialized).not.toContain('custom-super-secret');
    expect(serialized).not.toContain('secret-from-server');
  });

  it('retombe sur la configuration serveur quand rien n’est défini', async () => {
    const result = await controller.status(adminRequest);
    expect(result).toMatchObject({ source: 'env', managed_by: 'platform' });
  });

  it('refuse l acces a un utilisateur non administrateur', async () => {
    await expect(
      controller.status({ user: { role: 'avocat', tenantId: 7, permissions: [] } } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
