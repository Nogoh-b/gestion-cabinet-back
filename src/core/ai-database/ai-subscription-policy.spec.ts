import {
  readAiPlanPolicy,
  resolveSubscriptionAiConfig,
} from './ai-subscription-policy';

describe('IA selon le forfait', () => {
  const platform = {
    active_provider: 'mimo',
    providers: {
      mimo: { model: 'mimo-v2.6-flash' },
      custom_a: {
        model: 'a',
        base_url: 'https://example.com/v1',
        api_key: 'platform-key',
      },
    },
  };
  const assigned = { provider_id: 'mimo', model: 'mimo-v2.6-pro' };
  const cabinet = {
    selection_origin: 'cabinet' as const,
    active_provider: 'custom_a',
    providers: { custom_a: { model: 'a', api_key: 'injected' } },
  };
  it('sans autorisation explicite, ignore un choix cabinet', () => {
    const result = resolveSubscriptionAiConfig(
      platform,
      cabinet,
      readAiPlanPolicy(null),
    );
    expect(result?.active_provider).toBe('mimo');
    expect(result?.providers?.mimo.model).toBe('mimo-v2.6-flash');
  });
  it('impose le modèle du forfait', () => {
    const result = resolveSubscriptionAiConfig(
      platform,
      cabinet,
      readAiPlanPolicy({ default_model: assigned }),
    );
    expect(result?.providers?.mimo.model).toBe(assigned.model);
  });
  it('autorise uniquement les couples fournisseur/modèle inscrits au forfait et conserve les secrets plateforme', () => {
    const policy = readAiPlanPolicy({
      allow_model_selection: true,
      allowed_models: [{ provider_id: 'custom_a', model: 'a' }],
    });
    expect(
      resolveSubscriptionAiConfig(platform, cabinet, policy)?.providers
        ?.custom_a.api_key,
    ).toBe('platform-key');
    const changed = {
      ...cabinet,
      providers: { custom_a: { model: 'unlisted' } },
    };
    expect(
      resolveSubscriptionAiConfig(platform, changed, policy)?.active_provider,
    ).toBe('mimo');
  });
  it('révoque une configuration personnelle lors du retrait du droit', () => {
    const personal = {
      selection_origin: 'cabinet' as const,
      active_provider: 'tenant_test',
      providers: {
        tenant_test: {
          model: 'mine',
          api_key: 'key',
          base_url: 'https://example.com/v1',
        },
      },
    };
    expect(
      resolveSubscriptionAiConfig(
        platform,
        personal,
        readAiPlanPolicy({ allow_custom_providers: true }),
      )?.active_provider,
    ).toBe('tenant_test');
    expect(
      resolveSubscriptionAiConfig(platform, personal, readAiPlanPolicy(null))
        ?.active_provider,
    ).toBe('mimo');
  });
  it('conserve les exceptions attribuées par la plateforme', () => {
    expect(
      resolveSubscriptionAiConfig(
        platform,
        { ...cabinet, selection_origin: 'platform' },
        readAiPlanPolicy({ default_model: assigned }),
      )?.active_provider,
    ).toBe('custom_a');
  });
});
