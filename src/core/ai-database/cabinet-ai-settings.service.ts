import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import {
  AI_CONFIG_CHANGED_EVENT,
  AiModelRouterService,
} from './ai-model-router.service';
import {
  AiStoredConfig,
  CustomAiProviderInput,
  parseStoredAiConfig,
  validateCustomProvider,
} from './ai-provider-config';
import {
  AiPlanChoice,
  isAllowedAiChoice,
  readAiPlanPolicy,
} from './ai-subscription-policy';

@Injectable()
export class CabinetAiSettingsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly router: AiModelRouterService,
    private readonly events: EventEmitter2,
  ) {}

  private async state(tenantId: number) {
    const rows = await this.db.query(
      'SELECT c.ai_config, p.ai_policy, p.ai_enabled FROM cabinets c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ? LIMIT 1',
      [tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Cabinet introuvable');
    const config = parseStoredAiConfig(rows[0].ai_config);
    const policy = readAiPlanPolicy(rows[0].ai_policy);
    const locked =
      !!config?.active_provider && config.selection_origin !== 'cabinet';
    const enabled = !!Number(rows[0].ai_enabled);
    return { config, policy, locked, enabled };
  }

  async access(tenantId: number) {
    const { config, policy, locked, enabled } = await this.state(tenantId);
    const platform = await this.router.loadPlatformConfig();
    const choices: Array<AiPlanChoice & { label: string; is_custom: boolean }> =
      [];
    const active = config?.active_provider;
    const ownChoice = active ? config?.providers?.[active] : undefined;
    const selected =
      !!active &&
      (locked ||
        (active.startsWith('tenant_')
          ? policy.allow_custom_providers && !!ownChoice
          : isAllowedAiChoice(policy, {
              provider_id: active,
              model: ownChoice?.model ?? '',
            })));
    if (enabled && !locked && policy.allow_model_selection) {
      for (const choice of policy.allowed_models) {
        const runtime = this.router.getProviderRuntimeConfig(
          choice.provider_id,
          {
            ...platform?.providers?.[choice.provider_id],
            model: choice.model,
          },
        );
        if (!runtime?.api_key) continue;
        choices.push({
          ...choice,
          is_custom: false,
          label: `${this.router.getBuiltinProvider(choice.provider_id)?.label ?? platform?.providers?.[choice.provider_id]?.label ?? choice.provider_id} · ${choice.model}`,
        });
      }
    }
    const custom = Object.entries(config?.providers ?? {})
      .filter(([id]) => id.startsWith('tenant_'))
      .map(([id, value]) => ({
        id,
        label: value.label ?? id,
        base_url: value.base_url ?? '',
        model: value.model ?? '',
        has_api_key: !!value.api_key,
      }));
    if (enabled && !locked && policy.allow_custom_providers) {
      choices.push(
        ...custom.map((p) => ({
          provider_id: p.id,
          model: p.model,
          label: `${p.label} · ${p.model}`,
          is_custom: true,
        })),
      );
    }
    return {
      source: selected
        ? ('cabinet' as const)
        : policy.default_model
          ? ('plan' as const)
          : platform?.active_provider
            ? ('platform' as const)
            : ('env' as const),
      can_select_model:
        enabled &&
        !locked &&
        (policy.allow_model_selection || policy.allow_custom_providers),
      can_add_custom_provider:
        enabled && !locked && policy.allow_custom_providers,
      platform_override: locked,
      plan_default: policy.default_model,
      choices,
      custom_providers:
        enabled && !locked && policy.allow_custom_providers ? custom : [],
    };
  }

  async select(tenantId: number, choice: AiPlanChoice) {
    const state = await this.state(tenantId);
    this.assertWritable(state);
    const platform = await this.router.loadPlatformConfig();
    const own = state.config?.providers?.[choice.provider_id];
    const isOwn =
      choice.provider_id.startsWith('tenant_') &&
      state.policy.allow_custom_providers &&
      own?.model === choice.model;
    if (!isOwn && !isAllowedAiChoice(state.policy, choice)) {
      throw new ForbiddenException(
        'Ce modèle n’est pas autorisé par votre forfait',
      );
    }
    const stored = isOwn ? own : platform?.providers?.[choice.provider_id];
    const runtime = this.router.getProviderRuntimeConfig(choice.provider_id, {
      ...stored,
      model: choice.model,
    });
    if (!runtime?.api_key)
      throw new BadRequestException('Ce moteur n’est pas configuré');
    await this.write(tenantId, {
      ...state.config,
      selection_origin: 'cabinet',
      active_provider: choice.provider_id,
      providers: {
        ...state.config?.providers,
        [choice.provider_id]: isOwn ? own! : { model: choice.model },
      },
    });
  }

  async reset(tenantId: number) {
    const state = await this.state(tenantId);
    this.assertWritable(state);
    if (
      !state.policy.allow_model_selection &&
      !state.policy.allow_custom_providers
    )
      throw new ForbiddenException('Le moteur est géré par la plateforme');
    const config = { ...state.config, selection_origin: 'cabinet' as const };
    delete config.active_provider;
    await this.write(tenantId, config);
  }

  async saveCustom(tenantId: number, body: CustomAiProviderInput, id?: string) {
    const state = await this.state(tenantId);
    this.assertWritable(state);
    if (!state.policy.allow_custom_providers)
      throw new ForbiddenException(
        'Votre forfait ne permet pas les configurations personnelles',
      );
    const previous = id ? state.config?.providers?.[id] : undefined;
    if (id && (!id.startsWith('tenant_') || !previous))
      throw new NotFoundException('Configuration introuvable');
    const providers = { ...state.config?.providers };
    if (
      !id &&
      Object.keys(providers).filter((key) => key.startsWith('tenant_'))
        .length >= 20
    )
      throw new BadRequestException(
        'Maximum de 20 configurations personnelles atteint',
      );
    const provider = validateCustomProvider(
      {
        ...previous,
        ...body,
        api_key: body.api_key?.trim() || previous?.api_key,
      },
      true,
    );
    const unsafe = this.router.unsafeProviderUrlReason(provider.base_url!);
    if (unsafe) throw new BadRequestException(unsafe);
    provider.api_key = this.router.protectApiKey(provider.api_key!);
    providers[id ?? `tenant_${randomUUID().replace(/-/g, '').slice(0, 12)}`] =
      provider;
    await this.write(tenantId, {
      ...state.config,
      selection_origin: 'cabinet',
      providers,
    });
  }

  async deleteCustom(tenantId: number, id: string) {
    const state = await this.state(tenantId);
    this.assertWritable(state);
    if (!state.policy.allow_custom_providers)
      throw new ForbiddenException(
        'Votre forfait ne permet pas les configurations personnelles',
      );
    if (!id.startsWith('tenant_') || !state.config?.providers?.[id])
      throw new NotFoundException('Configuration introuvable');
    const providers = { ...state.config.providers };
    delete providers[id];
    const config = { ...state.config, providers };
    if (config.active_provider === id) delete config.active_provider;
    await this.write(tenantId, config);
  }

  private assertWritable(state: { locked: boolean; enabled: boolean }) {
    if (!state.enabled || state.locked)
      throw new ForbiddenException(
        'Le moteur IA est géré par la plateforme pour votre abonnement',
      );
  }

  private async write(tenantId: number, config: AiStoredConfig) {
    await this.db.query('UPDATE cabinets SET ai_config = ? WHERE id = ?', [
      JSON.stringify(config),
      tenantId,
    ]);
    this.events.emit(AI_CONFIG_CHANGED_EVENT, { tenantId });
  }
}
