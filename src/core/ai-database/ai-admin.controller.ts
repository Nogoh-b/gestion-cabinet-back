import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AiCabinetConfig,
  AiProviderConfig,
} from 'src/modules/cabinet/entities/cabinet.entity';
import { AppSettingsService } from 'src/modules/settings/services/app-settings.service';
import { AiModelRouterService } from './ai-model-router.service';

interface ActivateAiProviderBody {
  provider_id?: string;
  model?: string;
}

interface CustomAiProviderBody {
  label?: string;
  base_url?: string;
  model?: string;
  api_key?: string;
}

@ApiTags('AI Admin')
@ApiBearerAuth()
@Controller('api/ai-admin')
@UseGuards(JwtAuthGuard)
export class AiAdminController {
  constructor(
    private readonly router: AiModelRouterService,
    private readonly appSettings: AppSettingsService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Liste les fournisseurs IA sans exposer leurs cles',
  })
  async listProviders(@Req() req: Request) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);
    const config = (await this.appSettings.getAiConfig(tenantId)) ?? {};
    const configuredProviders = config.providers ?? {};

    // Charge aussi le cache synchrone utilise par les prochaines requetes IA.
    await this.router.getEffectiveConfigAsync(tenantId);

    const builtins = await Promise.all(
      this.router.listBuiltinProviders().map(async (definition) => {
        const stored = configuredProviders[definition.id];
        const runtime = this.router.getProviderRuntimeConfig(
          definition.id,
          stored,
        );
        const models = await this.router.listAvailableModels(
          definition.id,
          runtime,
        );
        const selectedModel =
          runtime?.model && models.includes(runtime.model)
            ? runtime.model
            : (models[0] ?? runtime?.model ?? definition.models[0]);
        return {
          ...definition,
          models,
          is_custom: false,
          selected_model: selectedModel,
          has_api_key: !!runtime?.api_key,
        };
      }),
    );

    const custom = Object.entries(configuredProviders)
      .filter(
        ([id, provider]) =>
          !this.router.isBuiltinProvider(id) && provider?.is_custom !== false,
      )
      .map(([id, provider]) => {
        const runtime = this.router.getProviderRuntimeConfig(id, provider);
        return {
          id,
          label: provider.label || id,
          base_url: runtime?.base_url ?? provider.base_url ?? '',
          models: runtime?.model ? [runtime.model] : [],
          description: 'Configuration OpenAI-compatible personnalisée',
          is_custom: true,
          selected_model: runtime?.model ?? '',
          has_api_key: !!runtime?.api_key,
        };
      });

    const activeProvider = this.providerExists(config, config.active_provider)
      ? config.active_provider!
      : 'deepseek';

    return {
      tenant_id: tenantId,
      active_provider: activeProvider,
      providers: [...builtins, ...custom],
      effective_per_profile: {
        fast: this.router.getEffectiveConfigSync('fast', 'fast'),
        quality: this.router.getEffectiveConfigSync('quality', 'balanced'),
        streaming: this.router.getEffectiveConfigSync('streaming', 'balanced'),
      },
    };
  }

  @Put('active')
  @ApiOperation({
    summary: 'Selectionne le fournisseur et le modele actifs du cabinet',
  })
  async activateProvider(
    @Req() req: Request,
    @Body() body: ActivateAiProviderBody,
  ) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);
    const providerId = this.cleanId(body?.provider_id);
    const model = this.cleanText(body?.model, 'model', 160);
    const config = (await this.appSettings.getAiConfig(tenantId)) ?? {};

    if (!this.providerExists(config, providerId)) {
      throw new NotFoundException(`Fournisseur IA inconnu : ${providerId}`);
    }

    const definition = this.router.getBuiltinProvider(providerId);
    const currentProvider = config.providers?.[providerId];
    const candidateRuntime = this.router.getProviderRuntimeConfig(providerId, {
      ...(currentProvider ?? {}),
      model,
    });
    const normalizedModel = candidateRuntime?.model ?? model;
    if (definition) {
      const availableModels = await this.router.listAvailableModels(
        providerId,
        candidateRuntime,
      );
      if (!availableModels.includes(normalizedModel)) {
        throw new BadRequestException(
          `Modele non disponible pour ${definition.label}`,
        );
      }
    }

    const providers = { ...(config.providers ?? {}) };
    providers[providerId] = definition
      ? { model: normalizedModel }
      : { ...(providers[providerId] ?? {}), model: normalizedModel };

    await this.appSettings.saveAiConfig(tenantId, {
      ...config,
      active_provider: providerId,
      providers,
    });

    const runtime = this.router.getProviderRuntimeConfig(
      providerId,
      providers[providerId],
    );
    return {
      ok: true,
      active_provider: providerId,
      model: normalizedModel,
      has_api_key: !!runtime?.api_key,
    };
  }

  @Post('providers')
  @ApiOperation({ summary: 'Ajoute une configuration IA personnalisee' })
  async createCustomProvider(
    @Req() req: Request,
    @Body() body: CustomAiProviderBody,
  ) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);
    const config = (await this.appSettings.getAiConfig(tenantId)) ?? {};
    const providers = { ...(config.providers ?? {}) };
    const customCount = Object.keys(providers).filter(
      (id) => !this.router.isBuiltinProvider(id),
    ).length;
    if (customCount >= 20) {
      throw new BadRequestException(
        'Maximum de 20 configurations personnalisees atteint',
      );
    }

    const provider = this.validateCustomProvider(body, true);
    provider.api_key = this.router.protectApiKey(provider.api_key!);
    const id = `custom_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    providers[id] = { ...provider, is_custom: true };
    await this.appSettings.saveAiConfig(tenantId, { ...config, providers });

    return this.publicCustomProvider(id, providers[id]);
  }

  @Put('providers/:id')
  @ApiOperation({ summary: 'Modifie une configuration IA personnalisee' })
  async updateCustomProvider(
    @Req() req: Request,
    @Param('id') rawId: string,
    @Body() body: CustomAiProviderBody,
  ) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);
    const id = this.cleanId(rawId);
    if (this.router.isBuiltinProvider(id)) {
      throw new BadRequestException(
        'Les fournisseurs integres se configurent via les variables serveur',
      );
    }

    const config = (await this.appSettings.getAiConfig(tenantId)) ?? {};
    const previous = config.providers?.[id];
    if (!previous)
      throw new NotFoundException('Configuration personnalisee introuvable');

    const provider = this.validateCustomProvider(
      {
        ...previous,
        ...body,
        api_key: body.api_key?.trim() || previous.api_key,
      },
      true,
    );
    provider.api_key = this.router.protectApiKey(provider.api_key!);
    const providers = {
      ...(config.providers ?? {}),
      [id]: { ...provider, is_custom: true },
    };
    await this.appSettings.saveAiConfig(tenantId, { ...config, providers });
    return this.publicCustomProvider(id, providers[id]);
  }

  @Delete('providers/:id')
  @ApiOperation({ summary: 'Supprime une configuration IA personnalisee' })
  async deleteCustomProvider(@Req() req: Request, @Param('id') rawId: string) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);
    const id = this.cleanId(rawId);
    if (this.router.isBuiltinProvider(id)) {
      throw new BadRequestException(
        'Un fournisseur integre ne peut pas etre supprime',
      );
    }

    const config = (await this.appSettings.getAiConfig(tenantId)) ?? {};
    if (!config.providers?.[id])
      throw new NotFoundException('Configuration personnalisee introuvable');
    if (config.active_provider === id) {
      throw new BadRequestException(
        'Selectionnez un autre fournisseur avant de supprimer celui-ci',
      );
    }

    const providers = { ...(config.providers ?? {}) };
    delete providers[id];
    await this.appSettings.saveAiConfig(tenantId, { ...config, providers });
    return { ok: true };
  }

  @Post('providers/:id/test')
  @ApiOperation({
    summary: 'Teste la configuration serveur d un fournisseur IA',
  })
  async testProvider(@Req() req: Request, @Param('id') rawId: string) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);
    const id = this.cleanId(rawId);
    const config = (await this.appSettings.getAiConfig(tenantId)) ?? {};
    if (!this.providerExists(config, id))
      throw new NotFoundException('Fournisseur IA introuvable');

    const runtime = this.router.getProviderRuntimeConfig(
      id,
      config.providers?.[id],
    );
    const apiKey = runtime?.api_key;
    if (!runtime || !apiKey) {
      return { ok: false, message: 'Aucune cle API configuree cote serveur' };
    }
    return this.router.testProviderConnection({
      base_url: runtime.base_url,
      model: runtime.model,
      api_key: apiKey,
    });
  }

  private assertAdmin(req: Request): void {
    const user = req.user as any;
    const superAdmin =
      Array.isArray(user?.permissions) &&
      user.permissions.includes('SUPER_ADMIN');
    if (user?.role !== 'admin' && !superAdmin) {
      throw new ForbiddenException("Reserve a l'administration");
    }
  }

  private tenantId(req: Request): number {
    const tenantId = Number((req.user as any)?.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw new BadRequestException('Cabinet courant invalide');
    }
    return tenantId;
  }

  private providerExists(
    config: AiCabinetConfig,
    providerId?: string,
  ): boolean {
    return (
      !!providerId &&
      (this.router.isBuiltinProvider(providerId) ||
        !!config.providers?.[providerId])
    );
  }

  private cleanId(value?: string): string {
    const id = String(value ?? '').trim();
    if (!/^[a-z0-9_-]{2,80}$/i.test(id)) {
      throw new BadRequestException('Identifiant de fournisseur invalide');
    }
    return id;
  }

  private cleanText(value: unknown, field: string, maxLength: number): string {
    const text = String(value ?? '').trim();
    if (!text || text.length > maxLength || /[\r\n\0]/.test(text)) {
      throw new BadRequestException(`${field} invalide`);
    }
    return text;
  }

  private validateCustomProvider(
    body: CustomAiProviderBody,
    requireKey: boolean,
  ): AiProviderConfig {
    const label = this.cleanText(body.label, 'label', 80);
    const model = this.cleanText(body.model, 'model', 160);
    const apiKey = String(body.api_key ?? '').trim();
    if (
      requireKey &&
      (!apiKey || apiKey.length > 1000 || /[\r\n\0]/.test(apiKey))
    ) {
      throw new BadRequestException('api_key invalide');
    }

    let url: URL;
    try {
      url = new URL(this.cleanText(body.base_url, 'base_url', 500));
    } catch {
      throw new BadRequestException('base_url doit etre une URL valide');
    }
    const localDev =
      process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(localDev && url.protocol === 'http:')) {
      throw new BadRequestException('base_url doit utiliser HTTPS');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new BadRequestException(
        'base_url ne doit contenir ni identifiants, ni parametres, ni fragment',
      );
    }

    return {
      label,
      base_url: url.toString().replace(/\/$/, ''),
      model,
      api_key: apiKey,
      is_custom: true,
    };
  }

  private publicCustomProvider(id: string, provider: AiProviderConfig) {
    return {
      id,
      label: provider.label || id,
      base_url: provider.base_url || '',
      models: provider.model ? [provider.model] : [],
      description: 'Configuration OpenAI-compatible personnalisée',
      is_custom: true,
      selected_model: provider.model || '',
      has_api_key: !!provider.api_key,
    };
  }
}
