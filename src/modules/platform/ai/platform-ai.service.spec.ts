import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { AI_CONFIG_CHANGED_EVENT, AiModelRouterService } from 'src/core/ai-database/ai-model-router.service';
import { PlatformAiService } from './platform-ai.service';

/** Base en mémoire : platform_settings['ai'] + colonne cabinets.ai_config. */
function memoryDb() {
  const state = {
    platform: null as string | null,
    cabinets: new Map<number, { id: number; name: string; ai_config: string | null }>([
      [7, { id: 7, name: 'Cabinet Sept', ai_config: null }],
      [8, { id: 8, name: 'Cabinet Huit', ai_config: null }],
    ]),
  };
  const db = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.startsWith('SELECT `value` FROM platform_settings')) {
        return state.platform ? [{ value: state.platform }] : [];
      }
      if (sql.startsWith('INSERT INTO platform_settings')) {
        state.platform = params[1];
        return [];
      }
      if (sql.startsWith('SELECT id, name, ai_config FROM cabinets WHERE id')) {
        const row = state.cabinets.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.startsWith('SELECT id, name, ai_config FROM cabinets WHERE ai_config IS NOT NULL')) {
        return [...state.cabinets.values()].filter((c) => c.ai_config);
      }
      if (sql.startsWith('UPDATE cabinets SET ai_config')) {
        const row = state.cabinets.get(params[1]);
        if (row) row.ai_config = params[0];
        return [];
      }
      throw new Error(`requête inattendue : ${sql}`);
    }),
  };
  return { db, state };
}

describe('PlatformAiService', () => {
  let state: ReturnType<typeof memoryDb>['state'];
  let events: { emit: jest.Mock };
  let service: PlatformAiService;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-secret-from-server';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const mem = memoryDb();
    state = mem.state;
    events = { emit: jest.fn() };
    // Vrai routeur : son catalogue de repli inclut le modèle courant, ce qui a
    // déjà masqué une validation trop permissive.
    const router = new AiModelRouterService();
    service = new PlatformAiService(mem.db as any, router, events as any);
  });

  it('définit le moteur par défaut de tous les cabinets et purge le cache IA', async () => {
    const result = await service.setDefault('deepseek', 'deepseek-v4-pro', 1);

    expect(result.default).toEqual({ provider_id: 'deepseek', model: 'deepseek-v4-pro' });
    expect(JSON.parse(state.platform!)).toMatchObject({ active_provider: 'deepseek', providers: { deepseek: { model: 'deepseek-v4-pro' } } });
    expect(events.emit).toHaveBeenCalledWith(AI_CONFIG_CHANGED_EVENT, {});
  });

  it('refuse un modèle hors catalogue pour un fournisseur intégré', async () => {
    await expect(service.setDefault('deepseek', 'modele-inconnu')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chiffre la clé d’un fournisseur personnalisé et ne la renvoie jamais', async () => {
    const result = await service.createProvider({ label: 'Mon LLM', base_url: 'https://llm.example.com/v1', model: 'm-1', api_key: 'cle-tres-secrete' });

    expect(JSON.stringify(result)).not.toContain('cle-tres-secrete');
    expect(state.platform).not.toContain('cle-tres-secrete');
    const created = result.providers.find((p) => p.label === 'Mon LLM');
    expect(created).toMatchObject({ is_custom: true, has_api_key: true, selected_model: 'm-1' });
  });

  it('pose puis retire une exception pour un cabinet', async () => {
    const set = await service.setCabinetOverride(7, 'deepseek', 'deepseek-v4-flash');
    expect(set.override).toEqual({ provider_id: 'deepseek', model: 'deepseek-v4-flash' });
    expect(events.emit).toHaveBeenCalledWith(AI_CONFIG_CHANGED_EVENT, { tenantId: 7 });
    expect((await service.overview()).overrides).toEqual([
      expect.objectContaining({ cabinet_id: 7, provider_id: 'deepseek', model: 'deepseek-v4-flash' }),
    ]);

    const cleared = await service.clearCabinetOverride(7);
    expect(cleared.override).toBeNull();
    expect(state.cabinets.get(7)!.ai_config).toBeNull();
  });

  it('refuse de supprimer un fournisseur encore utilisé par un cabinet', async () => {
    const created = await service.createProvider({ label: 'X', base_url: 'https://x.example.com/v1', model: 'x', api_key: 'k' });
    const id = created.providers.find((p) => p.label === 'X')!.id;
    await service.setCabinetOverride(8, id, 'x');

    await expect(service.deleteProvider(id)).rejects.toBeInstanceOf(BadRequestException);
  });
});
