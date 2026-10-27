import { describe, expect, it } from '@jest/globals';
import { mergeAiConfigs } from './ai-provider-config';

describe('mergeAiConfigs (défaut plateforme + exception cabinet)', () => {
  const platform = {
    active_provider: 'deepseek',
    providers: {
      deepseek: { model: 'deepseek-v4-flash' },
      custom_x: { label: 'X', base_url: 'https://x.example/v1', model: 'x-1', api_key: 'enc:v1:aaa', is_custom: true },
    },
  };

  it('sans exception, le cabinet suit le moteur par défaut de la plateforme', () => {
    expect(mergeAiConfigs(platform, null)).toEqual({ active_provider: 'deepseek', providers: platform.providers });
  });

  it("l'exception du cabinet choisit le fournisseur et le modèle ; URL et clé viennent du catalogue", () => {
    const merged = mergeAiConfigs(platform, { active_provider: 'custom_x', providers: { custom_x: { model: 'x-2' } } });
    expect(merged?.active_provider).toBe('custom_x');
    expect(merged?.providers?.custom_x).toEqual({ ...platform.providers.custom_x, model: 'x-2' });
  });

  it('sans rien de configuré, renvoie null (variables serveur)', () => {
    expect(mergeAiConfigs(null, null)).toBeNull();
    expect(mergeAiConfigs({ providers: platform.providers }, null)).toBeNull();
  });

  it('conserve une ancienne exception autonome (URL/clé propres au cabinet)', () => {
    const legacy = { active_provider: 'custom_old', providers: { custom_old: { base_url: 'https://old.example/v1', model: 'm', api_key: 'k' } } };
    expect(mergeAiConfigs(null, legacy)?.providers?.custom_old).toEqual(legacy.providers.custom_old);
  });
});
