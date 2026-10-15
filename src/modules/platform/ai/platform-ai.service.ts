import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { AiProviderConfig } from 'src/modules/cabinet/entities/cabinet.entity';
import {
  AI_CONFIG_CHANGED_EVENT,
  AiModelRouterService,
} from 'src/core/ai-database/ai-model-router.service';
import {
  AiStoredConfig,
  cleanAiText,
  cleanProviderId,
  CustomAiProviderInput,
  hasCabinetOverride,
  parseStoredAiConfig,
  PLATFORM_AI_SETTING_KEY,
  validateCustomProvider,
} from 'src/core/ai-database/ai-provider-config';
import { PlatformAuditContext } from '../audit/platform-audit.context';

export interface PlatformAiProviderView {
  id: string;
  label: string;
  base_url: string;
  models: string[];
  description: string;
  is_custom: boolean;
  selected_model: string;
  has_api_key: boolean;
}

/**
 * Module IA de la console plateforme : catalogue des fournisseurs, moteur par
 * défaut de tous les cabinets, exceptions par cabinet. Les clés ne sortent
 * jamais du serveur (ni dans les réponses, ni dans le journal d'audit).
 */
@Injectable()
export class PlatformAiService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly router: AiModelRouterService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────────

  async overview() {
    const config = await this.readPlatformConfig();
    const providers = await this.providerViews(config);
    const overrides = await this.listOverrides(providers);
    const defaultProvider =
      config.active_provider && this.providerExists(config, config.active_provider)
        ? {
            provider_id: config.active_provider,
            model:
              providers.find((p) => p.id === config.active_provider)?.selected_model ?? '',
          }
        : null;

    return {
      default: defaultProvider,
      /** Sans moteur par défaut : variables d'environnement du serveur. */
      env_fallback: {
        fast: this.router.getEffectiveConfigSync('fast', 'fast'),
        balanced: this.router.getEffectiveConfigSync('quality', 'balanced'),
        precise: this.router.getEffectiveConfigSync('quality', 'precise'),
      },
      providers,
      overrides,
    };
  }

  async cabinetOverride(cabinetId: number) {
    const cabinet = await this.readCabinet(cabinetId);
    const config = await this.readPlatformConfig();
    const providers = await this.providerViews(config);
    const override = hasCabinetOverride(cabinet.ai_config)
      ? {
          provider_id: cabinet.ai_config!.active_provider!,
          model: cabinet.ai_config!.providers?.[cabinet.ai_config!.active_provider!]?.model ?? '',
        }
      : null;
    return {
      cabinet_id: cabinet.id,
      cabinet_name: cabinet.name,
      override,
      default:
        config.active_provider && this.providerExists(config, config.active_provider)
          ? { provider_id: config.active_provider, model: config.providers?.[config.active_provider]?.model ?? '' }
          : null,
      providers,
    };
  }

  // ── Moteur par défaut ────────────────────────────────────────────────────

  async setDefault(providerIdRaw: string, modelRaw: string, adminId?: number) {
    const config = await this.readPlatformConfig();
    const { providerId, model } = await this.validateChoice(config, providerIdRaw, modelRaw);
    const before = this.publicChoice(config);
    const providers = { ...(config.providers ?? {}) };
    providers[providerId] = { ...(providers[providerId] ?? {}), model };
    const next: AiStoredConfig = { ...config, active_provider: providerId, providers };
    await this.writePlatformConfig(next, adminId);
    PlatformAuditContext.set({
      action: 'ai.default.update',
      targetType: 'platform_ai',
      summary: `Moteur IA par défaut : ${providerId} / ${model}`,
      before,
      after: this.publicChoice(next),
    });
    return this.overview();
  }

  async clearDefault(adminId?: number) {
    const config = await this.readPlatformConfig();
    const before = this.publicChoice(config);
    const next: AiStoredConfig = { ...config };
    delete next.active_provider;
    await this.writePlatformConfig(next, adminId);
    PlatformAuditContext.set({
      action: 'ai.default.clear',
      targetType: 'platform_ai',
      summary: 'Moteur IA par défaut : configuration serveur',
      before,
      after: null,
    });
    return this.overview();
  }

  // ── Fournisseurs personnalisés ───────────────────────────────────────────

  async createProvider(body: CustomAiProviderInput, adminId?: number) {
    const config = await this.readPlatformConfig();
    const providers = { ...(config.providers ?? {}) };
    const customCount = Object.keys(providers).filter((id) => !this.router.isBuiltinProvider(id)).length;
    if (customCount >= 20) {
      throw new BadRequestException('Maximum de 20 configurations personnalisées atteint');
    }
    const provider = validateCustomProvider(body, true);
    provider.api_key = this.router.protectApiKey(provider.api_key!);
    const id = `custom_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    providers[id] = { ...provider, is_custom: true };
    await this.writePlatformConfig({ ...config, providers }, adminId);
    PlatformAuditContext.set({
      action: 'ai.provider.create',
      targetType: 'platform_ai_provider',
      targetId: id,
      summary: `Fournisseur IA ajouté : ${provider.label}`,
      after: this.publicProvider(providers[id]),
    });
    return this.overview();
  }

  async updateProvider(rawId: string, body: CustomAiProviderInput, adminId?: number) {
    const id = cleanProviderId(rawId);
    if (this.router.isBuiltinProvider(id)) {
      throw new BadRequestException('Les fournisseurs intégrés se configurent via les variables serveur');
    }
    const config = await this.readPlatformConfig();
    const previous = config.providers?.[id];
    if (!previous) throw new NotFoundException('Configuration personnalisée introuvable');
    const provider = validateCustomProvider(
      { ...previous, ...body, api_key: body.api_key?.trim() || previous.api_key },
      true,
    );
    provider.api_key = this.router.protectApiKey(provider.api_key!);
    const providers = { ...(config.providers ?? {}), [id]: { ...provider, is_custom: true } };
    await this.writePlatformConfig({ ...config, providers }, adminId);
    PlatformAuditContext.set({
      action: 'ai.provider.update',
      targetType: 'platform_ai_provider',
      targetId: id,
      summary: `Fournisseur IA modifié : ${provider.label}`,
      before: this.publicProvider(previous),
      after: this.publicProvider(providers[id]),
    });
    return this.overview();
  }

  async deleteProvider(rawId: string, adminId?: number) {
    const id = cleanProviderId(rawId);
    if (this.router.isBuiltinProvider(id)) {
      throw new BadRequestException('Un fournisseur intégré ne peut pas être supprimé');
    }
    const config = await this.readPlatformConfig();
    const previous = config.providers?.[id];
    if (!previous) throw new NotFoundException('Configuration personnalisée introuvable');
    if (config.active_provider === id) {
      throw new BadRequestException('Ce fournisseur est le moteur par défaut : choisissez-en un autre avant de le supprimer');
    }
    const users = (await this.readOverrides()).filter((o) => o.provider_id === id);
    if (users.length) {
      throw new BadRequestException(
        `Ce fournisseur est utilisé par ${users.length} cabinet(s) : retirez d'abord leur exception`,
      );
    }
    const providers = { ...(config.providers ?? {}) };
    delete providers[id];
    await this.writePlatformConfig({ ...config, providers }, adminId);
    PlatformAuditContext.set({
      action: 'ai.provider.delete',
      targetType: 'platform_ai_provider',
      targetId: id,
      summary: `Fournisseur IA supprimé : ${previous.label ?? id}`,
      before: this.publicProvider(previous),
      after: null,
    });
    return this.overview();
  }

  async testProvider(rawId: string, modelRaw?: string) {
    const id = cleanProviderId(rawId);
    const config = await this.readPlatformConfig();
    if (!this.providerExists(config, id)) throw new NotFoundException('Fournisseur IA introuvable');
    const stored = config.providers?.[id];
    const model = modelRaw ? cleanAiText(modelRaw, 'model', 160) : undefined;
    const runtime = this.router.getProviderRuntimeConfig(id, model ? { ...(stored ?? {}), model } : stored);
    if (!runtime?.api_key) {
      return { ok: false, message: 'Aucune clé API configurée côté serveur' };
    }
    return this.router.testProviderConnection({
      base_url: runtime.base_url,
      model: runtime.model,
      api_key: runtime.api_key,
    });
  }

  // ── Exceptions par cabinet ───────────────────────────────────────────────

  async setCabinetOverride(cabinetId: number, providerIdRaw: string, modelRaw: string) {
    const cabinet = await this.readCabinet(cabinetId);
    const config = await this.readPlatformConfig();
    const { providerId, model } = await this.validateChoice(config, providerIdRaw, modelRaw);
    const next: AiStoredConfig = { active_provider: providerId, providers: { [providerId]: { model } } };
    await this.writeCabinetConfig(cabinet.id, next);
    PlatformAuditContext.set({
      action: 'ai.cabinet_override.update',
      targetType: 'cabinet',
      targetId: cabinet.id,
      cabinetId: cabinet.id,
      summary: `Moteur IA du cabinet « ${cabinet.name} » : ${providerId} / ${model}`,
      before: this.publicChoice(cabinet.ai_config),
      after: this.publicChoice(next),
    });
    return this.cabinetOverride(cabinet.id);
  }

  async clearCabinetOverride(cabinetId: number) {
    const cabinet = await this.readCabinet(cabinetId);
    await this.writeCabinetConfig(cabinet.id, null);
    PlatformAuditContext.set({
      action: 'ai.cabinet_override.clear',
      targetType: 'cabinet',
      targetId: cabinet.id,
      cabinetId: cabinet.id,
      summary: `Moteur IA du cabinet « ${cabinet.name} » : défaut plateforme`,
      before: this.publicChoice(cabinet.ai_config),
      after: null,
    });
    return this.cabinetOverride(cabinet.id);
  }

  // ── Interne ──────────────────────────────────────────────────────────────

  private async validateChoice(config: AiStoredConfig, providerIdRaw: string, modelRaw: string) {
    const providerId = cleanProviderId(providerIdRaw);
    const model = cleanAiText(modelRaw, 'model', 160);
    if (!this.providerExists(config, providerId)) {
      throw new NotFoundException(`Fournisseur IA inconnu : ${providerId}`);
    }
    const definition = this.router.getBuiltinProvider(providerId);
    const runtime = this.router.getProviderRuntimeConfig(providerId, {
      ...(config.providers?.[providerId] ?? {}),
      model,
    });
    const normalizedModel = runtime?.model ?? model;
    if (definition && providerId !== 'google') {
      // Google publie ses modèles en continu : saisie libre, validée par « Tester ».
      // Le catalogue se calcule SANS le modèle demandé : le repli de
      // `listAvailableModels` inclut le modèle courant, il serait donc
      // toujours accepté.
      const catalogRuntime = this.router.getProviderRuntimeConfig(providerId, {
        ...(config.providers?.[providerId] ?? {}),
        model: undefined,
      });
      const available = await this.router.listAvailableModels(providerId, catalogRuntime);
      if (!available.includes(normalizedModel)) {
        throw new BadRequestException(`Modèle non disponible pour ${definition.label}`);
      }
    }
    return { providerId, model: normalizedModel };
  }

  private providerExists(config: AiStoredConfig, providerId?: string): boolean {
    return !!providerId && (this.router.isBuiltinProvider(providerId) || !!config.providers?.[providerId]);
  }

  private async providerViews(config: AiStoredConfig): Promise<PlatformAiProviderView[]> {
    const stored = config.providers ?? {};
    const builtins = await Promise.all(
      this.router.listBuiltinProviders().map(async (definition) => {
        const runtime = this.router.getProviderRuntimeConfig(definition.id, stored[definition.id]);
        const models = await this.router.listAvailableModels(definition.id, runtime);
        const selected =
          runtime?.model && models.includes(runtime.model)
            ? runtime.model
            : (models[0] ?? runtime?.model ?? definition.models[0]);
        return {
          id: definition.id,
          label: definition.label,
          base_url: runtime?.base_url ?? definition.base_url,
          models,
          description: definition.description,
          is_custom: false,
          selected_model: selected,
          has_api_key: !!runtime?.api_key,
        };
      }),
    );
    const custom = Object.entries(stored)
      .filter(([id]) => !this.router.isBuiltinProvider(id))
      .map(([id, provider]) => {
        const runtime = this.router.getProviderRuntimeConfig(id, provider);
        return {
          id,
          label: provider?.label || id,
          base_url: runtime?.base_url ?? provider?.base_url ?? '',
          models: runtime?.model ? [runtime.model] : [],
          description: 'Configuration compatible OpenAI personnalisée',
          is_custom: true,
          selected_model: runtime?.model ?? '',
          has_api_key: !!runtime?.api_key,
        };
      });
    return [...builtins, ...custom];
  }

  private async readOverrides() {
    const rows: Array<{ id: number; name: string; ai_config: unknown }> = await this.db.query(
      'SELECT id, name, ai_config FROM cabinets WHERE ai_config IS NOT NULL ORDER BY name',
    );
    return rows
      .map((row) => ({ row, config: parseStoredAiConfig(row.ai_config) }))
      .filter(({ config }) => hasCabinetOverride(config))
      .map(({ row, config }) => ({
        cabinet_id: Number(row.id),
        cabinet_name: row.name,
        provider_id: config!.active_provider!,
        model: config!.providers?.[config!.active_provider!]?.model ?? '',
      }));
  }

  private async listOverrides(providers: PlatformAiProviderView[]) {
    const overrides = await this.readOverrides();
    return overrides.map((o) => ({
      ...o,
      provider_label: providers.find((p) => p.id === o.provider_id)?.label ?? o.provider_id,
    }));
  }

  private async readCabinet(cabinetId: number) {
    if (!Number.isInteger(cabinetId) || cabinetId <= 0) {
      throw new BadRequestException('Cabinet invalide');
    }
    const rows: Array<{ id: number; name: string; ai_config: unknown }> = await this.db.query(
      'SELECT id, name, ai_config FROM cabinets WHERE id = ? LIMIT 1',
      [cabinetId],
    );
    if (!rows.length) throw new NotFoundException(`Cabinet #${cabinetId} introuvable`);
    return { id: Number(rows[0].id), name: rows[0].name, ai_config: parseStoredAiConfig(rows[0].ai_config) };
  }

  private async readPlatformConfig(): Promise<AiStoredConfig> {
    const rows: Array<{ value: unknown }> = await this.db.query(
      'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [PLATFORM_AI_SETTING_KEY],
    );
    return parseStoredAiConfig(rows?.[0]?.value) ?? {};
  }

  private async writePlatformConfig(config: AiStoredConfig, adminId?: number): Promise<void> {
    await this.db.query(
      `INSERT INTO platform_settings (\`key\`, \`value\`, updated_by_admin_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_by_admin_id = VALUES(updated_by_admin_id), updated_at = CURRENT_TIMESTAMP`,
      [PLATFORM_AI_SETTING_KEY, JSON.stringify(config), adminId ?? null],
    );
    // Tous les cabinets peuvent être concernés : purge globale du cache IA.
    this.events.emit(AI_CONFIG_CHANGED_EVENT, {});
  }

  private async writeCabinetConfig(cabinetId: number, config: AiStoredConfig | null): Promise<void> {
    await this.db.query('UPDATE cabinets SET ai_config = ? WHERE id = ?', [
      config ? JSON.stringify(config) : null,
      cabinetId,
    ]);
    this.events.emit(AI_CONFIG_CHANGED_EVENT, { tenantId: cabinetId });
  }

  /** Choix public (fournisseur + modèle) — jamais de clé. */
  private publicChoice(config: AiStoredConfig | null | undefined) {
    if (!config?.active_provider) return null;
    return {
      provider_id: config.active_provider,
      model: config.providers?.[config.active_provider]?.model ?? null,
    };
  }

  private publicProvider(provider: AiProviderConfig | undefined) {
    if (!provider) return null;
    return {
      label: provider.label ?? null,
      base_url: provider.base_url ?? null,
      model: provider.model ?? null,
      has_api_key: !!provider.api_key,
    };
  }
}
