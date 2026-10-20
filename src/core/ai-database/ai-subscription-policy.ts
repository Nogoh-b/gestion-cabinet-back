import type { AiStoredConfig } from './ai-provider-config';
import { mergeAiConfigs } from './ai-provider-config';

export interface AiPlanChoice {
  provider_id: string;
  model: string;
}
export interface AiPlanPolicy {
  default_model: AiPlanChoice | null;
  allow_model_selection: boolean;
  allow_custom_providers: boolean;
  allowed_models: AiPlanChoice[];
}

export function readAiPlanPolicy(raw: unknown): AiPlanPolicy {
  let value: any = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  return {
    default_model: value?.default_model ?? null,
    allow_model_selection: value?.allow_model_selection === true,
    allow_custom_providers: value?.allow_custom_providers === true,
    allowed_models: Array.isArray(value?.allowed_models)
      ? value.allowed_models
      : [],
  };
}

export function isAllowedAiChoice(
  policy: AiPlanPolicy,
  choice: AiPlanChoice,
): boolean {
  return (
    policy.allow_model_selection &&
    policy.allowed_models.some(
      (item) =>
        item.provider_id === choice.provider_id && item.model === choice.model,
    )
  );
}

/** Re-evaluated at resolution, so a downgrade revokes old tenant choices. */
export function resolveSubscriptionAiConfig(
  platform: AiStoredConfig | null,
  cabinet: AiStoredConfig | null,
  policy: AiPlanPolicy,
): AiStoredConfig | null {
  // Explicit platform exceptions retain priority; historical records are platform-owned.
  if (cabinet?.active_provider && cabinet.selection_origin !== 'cabinet') {
    return mergeAiConfigs(platform, cabinet);
  }
  const id = cabinet?.active_provider;
  const own = id ? cabinet?.providers?.[id] : undefined;
  if (
    id &&
    own &&
    ((id.startsWith('tenant_') && policy.allow_custom_providers) ||
      isAllowedAiChoice(policy, { provider_id: id, model: own.model ?? '' }))
  ) {
    return mergeAiConfigs(platform, cabinet);
  }
  if (policy.default_model) {
    const choice = policy.default_model;
    return mergeAiConfigs(platform, {
      active_provider: choice.provider_id,
      providers: { [choice.provider_id]: { model: choice.model } },
    });
  }
  return mergeAiConfigs(platform, null);
}
