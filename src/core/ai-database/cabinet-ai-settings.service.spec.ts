import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { CabinetAiSettingsService } from './cabinet-ai-settings.service';
import { AiModelRouterService } from './ai-model-router.service';

describe('CabinetAiSettingsService', () => {
  let row: any;
  let db: any;
  let router: AiModelRouterService;
  let service: CabinetAiSettingsService;
  beforeEach(() => {
    row = { ai_enabled: 1, ai_policy: null, ai_config: null };
    db = {
      query: jest.fn(async (sql, params) => {
        if (sql.startsWith('UPDATE')) {
          row.ai_config = JSON.parse(params[0]);
          return { affectedRows: 1 };
        }
        return [row];
      }),
    };
    router = new AiModelRouterService();
    jest
      .spyOn(router, 'loadPlatformConfig')
      .mockResolvedValue({
        providers: {
          custom_platform: {
            label: 'Plateforme',
            model: 'approved',
            base_url: 'https://example.com/v1',
            api_key: 'platform-secret',
          },
        },
      });
    service = new CabinetAiSettingsService(db, router, new EventEmitter2());
  });
  it('refuse les mutations et ne propose aucun modèle sans autorisation du forfait', async () => {
    expect(await service.access(7)).toMatchObject({
      can_select_model: false,
      can_add_custom_provider: false,
      choices: [],
    });
    await expect(
      service.select(7, { provider_id: 'custom_platform', model: 'approved' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.saveCustom(7, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(
      db.query.mock.calls.every(([sql]) => !sql.startsWith('UPDATE')),
    ).toBe(true);
  });
  it('vérifie le modèle exact, le tenant courant et ne publie jamais la clé plateforme', async () => {
    row.ai_policy = {
      allow_model_selection: true,
      allowed_models: [{ provider_id: 'custom_platform', model: 'approved' }],
    };
    await expect(
      service.select(7, { provider_id: 'custom_platform', model: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.select(7, {
      provider_id: 'custom_platform',
      model: 'approved',
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cabinets'),
      [expect.any(String), 7],
    );
    expect(JSON.stringify(await service.access(7))).not.toContain(
      'platform-secret',
    );
    expect(row.ai_config.providers.custom_platform).toEqual({
      model: 'approved',
    });
  });
  it('chiffre les clés personnelles et refuse les adresses locales', async () => {
    row.ai_policy = { allow_custom_providers: true };
    const original = process.env.AI_CONFIG_ENCRYPTION_KEY;
    process.env.AI_CONFIG_ENCRYPTION_KEY = 'test-encryption';
    try {
      await service.saveCustom(7, {
        label: 'Personnel',
        model: 'mine',
        base_url: 'https://example.com/v1',
        api_key: 'my-private-key',
      });
      expect(JSON.stringify(row.ai_config)).not.toContain('my-private-key');
      expect(JSON.stringify(await service.access(7))).not.toContain('enc:v1:');
      await expect(
        service.saveCustom(7, {
          label: 'Local',
          model: 'm',
          base_url: 'https://127.0.0.1/v1',
          api_key: 'key',
        }),
      ).rejects.toThrow();
    } finally {
      if (original === undefined) delete process.env.AI_CONFIG_ENCRYPTION_KEY;
      else process.env.AI_CONFIG_ENCRYPTION_KEY = original;
    }
  });
  it('une exception plateforme ne peut pas être remplacée par le cabinet', async () => {
    row.ai_policy = {
      allow_model_selection: true,
      allow_custom_providers: true,
    };
    row.ai_config = {
      active_provider: 'mimo',
      providers: { mimo: { model: 'mimo-v2.6-pro' } },
    };
    await expect(service.reset(7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await service.access(7)).toMatchObject({
      platform_override: true,
      can_select_model: false,
    });
  });
});
