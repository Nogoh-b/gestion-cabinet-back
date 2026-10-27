/// <reference types="jest" />
import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { DEFAULT_AI_CONTEXT_CONFIGS, matchAiContext } from './ai-context-defaults';
import { AiContextConfigController } from './ai-context-config.controller';
import { AiContextConfigService } from './ai-context-config.service';
import { AiContextConfig } from './entities/ai-context-config.entity';
import { AiAssistantSettingsDto } from './dto/ai-context-config.dto';
import { formatPageContext } from './page-context';

describe('Configuration des contextes IA', () => {
  it('une règle propre à l’opération prime, même désactivée et sans suggestions', () => {
    const override = { ...DEFAULT_AI_CONTEXT_CONFIGS[0], resource_type: 'dossier_action', scope: 'complete', operation_key: 'complete-action', enabled: false, suggestions: [] };
    expect(matchAiContext([...DEFAULT_AI_CONTEXT_CONFIGS, override], 'dossier_action', 'complete', 'complete-action')).toBe(override);
    expect(matchAiContext(DEFAULT_AI_CONTEXT_CONFIGS, 'dossier_action', 'complete')?.label).toBe('Fin d’action');
  });
  it('charge uniquement les configurations et suggestions du cabinet courant', async () => {
    const repo: any = { find: jest.fn().mockResolvedValue([{ id: 9, tenant_id: 2, resource_type: '*', scope: '*', operation_key: '*', enabled: false,
      suggestions: [{ id: 1, tenant_id: 2, sort_order: 0 }, { id: 2, tenant_id: 3, sort_order: 0 }] }]) };
    const rows = await new AiContextConfigService(repo, {} as any).list(2);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 2 } }));
    expect(rows.find((row) => row.id === 9)?.suggestions).toHaveLength(1);
  });
  it('interdit toute modification de configuration à un utilisateur non administrateur', () => {
    const service: any = { save: jest.fn() };
    const controller = new AiContextConfigController(service);
    expect(() => controller.create({ user: { tenantId: 2, role: 'user' } }, DEFAULT_AI_CONTEXT_CONFIGS[0])).toThrow(ForbiddenException);
    expect(service.save).not.toHaveBeenCalled();
  });
  it('ignore les identifiants et cabinets injectés dans les données de création', async () => {
    const contexts: any = { findOneBy: jest.fn().mockResolvedValue(null), create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 3 }), findOne: jest.fn().mockResolvedValue({ id: 3 }) };
    const suggestions: any = { create: jest.fn((value) => value), delete: jest.fn().mockResolvedValue(undefined), save: jest.fn().mockResolvedValue([]) };
    const manager: any = { getRepository: (entity) => entity === AiContextConfig ? contexts : suggestions };
    const source: any = { transaction: async (run) => run(manager) };
    await new AiContextConfigService(contexts, source).save(2, { ...DEFAULT_AI_CONTEXT_CONFIGS[0], id: 999, tenant_id: 999,
      suggestions: [{ ...DEFAULT_AI_CONTEXT_CONFIGS[0].suggestions[0], id: 555, context_id: 999, tenant_id: 999 }] } as any);
    expect(contexts.create).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 2 }));
    expect(contexts.create.mock.calls[0][0]).not.toHaveProperty('id');
    expect(suggestions.create).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 2, context_id: 3 }));
    expect(suggestions.create.mock.calls[0][0]).not.toHaveProperty('id');
    expect(suggestions.delete).toHaveBeenCalledWith({ tenant_id: 2, context_id: 3 });
  });
  it('filtre les suggestions désactivées ou soumises à une permission', async () => {
    const service: any = { listPublic: jest.fn().mockResolvedValue([{ suggestions: [{ enabled: true, permission: 'edit_dossier' }, { enabled: false }, { enabled: true }] }]) };
    const rows = await new AiContextConfigController(service).list({ user: { tenantId: 2, role: 'user', permissions: [] } });
    expect(rows[0].suggestions).toEqual([{ enabled: true }]);
  });
  it('une sélection vide ne se transforme jamais en action sur toute la collection', () => {
    const text = formatPageContext(JSON.stringify({ scope: 'selection', selectedIds: [], resourceType: 'dossier' }));
    expect(text).toContain('une sélection vide ne désigne jamais toute la collection');
    expect(formatPageContext('{broken')).toBe('');
  });
});

describe('Activation de l’aide intelligente par cabinet', () => {
  const settingsKey = { resource_type: '*', scope: '*', operation_key: '__assistant_settings' };
  function repository(initial: any[] = []) {
    const stored = initial.map((row) => ({ ...row, suggestions: [...(row.suggestions ?? [])] }));
    const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
    const repo: any = {
      find: jest.fn(async ({ where }) => stored.filter((row) => matches(row, where))),
      findOneBy: jest.fn(async (where) => stored.find((row) => matches(row, where)) ?? null),
      upsert: jest.fn(async (value, keys: string[]) => {
        const existing = stored.find((row) => keys.every((key) => row[key] === value[key]));
        if (existing) Object.assign(existing, value);
        else stored.push({ id: stored.length + 100, suggestions: [], ...value });
      }),
    };
    return { repo, stored, service: new AiContextConfigService(repo, {} as any) };
  }

  it('est active par défaut et isole le réglage de chaque cabinet', async () => {
    const { repo, service } = repository();
    expect(await service.getSettings(2)).toEqual({ enabled: true });
    await service.saveSettings(2, { enabled: false });
    expect(await service.getSettings(2)).toEqual({ enabled: false });
    expect(await service.getSettings(3)).toEqual({ enabled: true });
    expect(repo.findOneBy).toHaveBeenCalledWith({ tenant_id: 3, ...settingsKey });
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 2, ...settingsKey, enabled: false }),
      ['tenant_id', 'resource_type', 'scope', 'operation_key']);
    expect((await service.match(2, 'client', 'resource'))?.enabled).toBe(false);
    expect((await service.match(3, 'client', 'resource'))?.enabled).toBe(true);
  });

  it('désactive les contextes publics même avec une règle explicite active et préserve les choix propres lors des bascules', async () => {
    const enabledContext = { ...DEFAULT_AI_CONTEXT_CONFIGS[7], id: 7, tenant_id: 2,
      operation_key: 'complete-action', instructions: 'Consigne du cabinet', enabled: true,
      suggestions: [{ ...DEFAULT_AI_CONTEXT_CONFIGS[7].suggestions[0], id: 4, tenant_id: 2 }] };
    const disabledContext = { ...DEFAULT_AI_CONTEXT_CONFIGS[0], id: 8, tenant_id: 2,
      resource_type: 'client', scope: 'resource', enabled: false, suggestions: [] };
    const { service, stored } = repository([enabledContext, disabledContext]);
    const before = structuredClone(stored);
    await service.saveSettings(2, { enabled: false });
    const publicRows = await service.listPublic(2);
    expect(publicRows.every((row) => row.enabled === false && row.suggestions.length === 0)).toBe(true);
    expect((await service.match(2, 'dossier_action', 'complete', 'complete-action'))?.enabled).toBe(false);
    const manageableRows = await service.list(2);
    expect(manageableRows.find((row) => row.id === 7)?.enabled).toBe(true);
    expect(manageableRows.find((row) => row.id === 8)?.enabled).toBe(false);
    expect(manageableRows.some((row) => row.operation_key === settingsKey.operation_key)).toBe(false);
    expect(publicRows.some((row) => row.operation_key === settingsKey.operation_key)).toBe(false);

    await service.saveSettings(2, { enabled: true });
    expect((await service.match(2, 'dossier_action', 'complete', 'complete-action'))?.enabled).toBe(true);
    expect((await service.match(2, 'client', 'resource'))?.enabled).toBe(false);
    expect(stored.filter((row) => row.operation_key !== settingsKey.operation_key)).toEqual(before);
    expect(stored.filter((row) => row.operation_key === settingsKey.operation_key)).toHaveLength(1);
  });

  it('permet la consultation authentifiée et réserve la bascule aux administrateurs', async () => {
    const service: any = { getSettings: jest.fn().mockResolvedValue({ enabled: true }), saveSettings: jest.fn().mockResolvedValue({ enabled: false }) };
    const controller = new AiContextConfigController(service);
    const member = { user: { tenantId: 2, role: 'user' } };
    expect(await controller.settings(member)).toEqual({ enabled: true });
    expect(() => controller.updateSettings(member, { enabled: false })).toThrow(ForbiddenException);
    expect(service.saveSettings).not.toHaveBeenCalled();
    await controller.updateSettings({ user: { tenantId: 3, role: 'admin' } }, { enabled: false });
    expect(service.saveSettings).toHaveBeenCalledWith(3, { enabled: false });
    expect(() => controller.settings({ user: { tenantId: 0 } })).toThrow(BadRequestException);
  });

  it.each([{ enabled: 'false' }, { enabled: 0 }, {}, { enabled: true, tenant_id: 99 }])('rejette le corps de réglage invalide %j', async (body) => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform(body, { type: 'body', metatype: AiAssistantSettingsDto })).rejects.toThrow(BadRequestException);
  });

  it('empêche la création et le remplacement du réglage réservé par la gestion des contextes', async () => {
    const { service } = repository();
    await expect(service.save(2, { ...DEFAULT_AI_CONTEXT_CONFIGS[0], ...settingsKey })).rejects.toThrow(BadRequestException);
    const contexts: any = { findOneBy: jest.fn().mockResolvedValue({ id: 12, tenant_id: 2, ...settingsKey }), save: jest.fn() };
    const source: any = { transaction: (run) => run({ getRepository: () => contexts }) };
    await expect(new AiContextConfigService(contexts, source).save(2, DEFAULT_AI_CONTEXT_CONFIGS[0], 12)).rejects.toThrow(BadRequestException);
    expect(contexts.save).not.toHaveBeenCalled();
    expect(contexts.findOneBy).toHaveBeenCalledWith({ tenant_id: 2, id: 12 });
  });
});
