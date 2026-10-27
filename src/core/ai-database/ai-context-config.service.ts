import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AiContextConfig, AiContextSuggestion } from './entities/ai-context-config.entity';
import { AiContextConfigDto, AiAssistantSettingsDto } from './dto/ai-context-config.dto';
import { DEFAULT_AI_CONTEXT_CONFIGS, matchAiContext } from './ai-context-defaults';

const ASSISTANT_SETTINGS_CONTEXT = { resource_type: '*', scope: '*', operation_key: '__assistant_settings' };
const isAssistantSettings = (entry: { resource_type: string; scope: string; operation_key: string }) =>
  entry.resource_type === ASSISTANT_SETTINGS_CONTEXT.resource_type && entry.scope === ASSISTANT_SETTINGS_CONTEXT.scope
  && entry.operation_key === ASSISTANT_SETTINGS_CONTEXT.operation_key;

@Injectable()
export class AiContextConfigService {
  constructor(@InjectRepository(AiContextConfig) private readonly configs: Repository<AiContextConfig>, private readonly dataSource: DataSource) {}

  async getSettings(tenantId: number) {
    const settings = await this.configs.findOneBy({ tenant_id: tenantId, ...ASSISTANT_SETTINGS_CONTEXT });
    return { enabled: settings?.enabled ?? true };
  }

  async saveSettings(tenantId: number, dto: AiAssistantSettingsDto) {
    if (typeof dto?.enabled !== 'boolean') throw new BadRequestException('Le réglage de l’aide intelligente doit être un booléen');
    await this.configs.upsert({ tenant_id: tenantId, ...ASSISTANT_SETTINGS_CONTEXT,
      label: 'Aide intelligente', instructions: '', enabled: dto.enabled },
    ['tenant_id', 'resource_type', 'scope', 'operation_key']);
    return { enabled: dto.enabled };
  }

  async list(tenantId: number) {
    const rows = await this.configs.find({ where: { tenant_id: tenantId }, relations: ['suggestions'], order: { id: 'ASC' } });
    const stored = rows.filter((entry) => !isAssistantSettings(entry));
    const key = (entry: { resource_type: string; scope: string; operation_key: string }) => `${entry.resource_type}:${entry.scope}:${entry.operation_key}`;
    const defaults = DEFAULT_AI_CONTEXT_CONFIGS.filter((entry) => !stored.some((row) => key(row) === key(entry)))
      .map((entry, index) => ({ ...entry, id: -(index + 1), suggestions: entry.suggestions.map((suggestion) => ({ ...suggestion })) }));
    return [...stored.map((entry) => ({ ...entry, suggestions: entry.suggestions.filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) })), ...defaults];
  }

  async listPublic(tenantId: number) {
    const [configs, settings] = await Promise.all([this.list(tenantId), this.getSettings(tenantId)]);
    return settings.enabled ? configs : configs.map((config) => ({ ...config, enabled: false, suggestions: [] }));
  }

  async match(tenantId: number, resource: string, scope: string, operation = '*') {
    return matchAiContext(await this.listPublic(tenantId), resource, scope, operation);
  }

  async save(tenantId: number, dto: AiContextConfigDto, id?: number) {
    if (isAssistantSettings(dto)) throw new BadRequestException('Ce contexte est réservé au réglage de l’aide intelligente');
    if (new Set(dto.suggestions.map((entry) => entry.code)).size !== dto.suggestions.length) throw new BadRequestException('Les codes des suggestions doivent être uniques');
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AiContextConfig);
      const suggestions = manager.getRepository(AiContextSuggestion);
      const existing = id ? await repo.findOneBy({ id, tenant_id: tenantId }) : undefined;
      if (id && !existing) throw new NotFoundException('Configuration IA introuvable');
      if (existing && isAssistantSettings(existing)) throw new BadRequestException('Ce contexte est réservé au réglage de l’aide intelligente');
      const duplicate = await repo.findOneBy({ tenant_id: tenantId, resource_type: dto.resource_type, scope: dto.scope, operation_key: dto.operation_key });
      if (duplicate && duplicate.id !== id) throw new BadRequestException('Une configuration existe déjà pour cette ressource, ce contexte et cette opération');
      const context = await repo.save(repo.create({ resource_type: dto.resource_type, scope: dto.scope,
        operation_key: dto.operation_key, label: dto.label, instructions: dto.instructions ?? '',
        enabled: dto.enabled, tenant_id: tenantId, ...(id ? { id } : {}) }));
      await suggestions.delete({ context_id: context.id, tenant_id: tenantId });
      if (dto.suggestions.length) await suggestions.save(dto.suggestions.map((entry) => suggestions.create({
        code: entry.code, label: entry.label, prompt: entry.prompt, intent: entry.intent,
        sort_order: entry.sort_order, enabled: entry.enabled, permission: entry.permission || null,
        tenant_id: tenantId, context_id: context.id,
      })));
      return repo.findOne({ where: { id: context.id, tenant_id: tenantId }, relations: ['suggestions'] });
    });
  }
}
