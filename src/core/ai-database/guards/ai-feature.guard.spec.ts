import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AiDatabaseController } from '../ai-database.controller';
import { AiFeatureGuard, AiTechnicalGuard } from './ai-feature.guard';

describe('AiFeatureGuard', () => {
  const previousAiEnabled = process.env.AI_ENABLED;
  const usersService = {
    getUserPermissions: jest.fn(),
  };

  const contextFor = (user: Record<string, unknown>) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (previousAiEnabled === undefined) {
      delete process.env.AI_ENABLED;
    } else {
      process.env.AI_ENABLED = previousAiEnabled;
    }
  });

  it('coupe l’IA quand AI_ENABLED=false', async () => {
    process.env.AI_ENABLED = 'false';
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ role: 'admin' }) as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('laisse le forfait décider quand AI_ENABLED est absent', async () => {
    delete process.env.AI_ENABLED;
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 2, role: 'avocat', permissions: ['use_ai_assistant'] }) as any),
    ).resolves.toBe(true);
  });

  it('accepte un non-administrateur qui a la permission IA', async () => {
    process.env.AI_ENABLED = 'true';
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({
        id: 2,
        role: 'collaborateur',
        permissions: ['view_dossiers', 'use_ai_assistant'],
      }) as any),
    ).resolves.toBe(true);
    expect(usersService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('refuse un utilisateur sans la permission IA, sans requête en base', async () => {
    process.env.AI_ENABLED = 'true';
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 2, role: 'stagiaire', permissions: ['view_dossiers'] }) as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('accepte l’administrateur du cabinet par son rôle', async () => {
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 1, role: 'admin', permissions: [] }) as any),
    ).resolves.toBe(true);
  });

  it('relit les permissions en base pour un ancien jeton sans permissions', async () => {
    usersService.getUserPermissions.mockResolvedValue([{ code: 'use_ai_assistant' }]);
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 3, role: 'avocat', permissions: [] }) as any),
    ).resolves.toBe(true);
    expect(usersService.getUserPermissions).toHaveBeenCalledWith(3);
  });

  it('accepte le super administrateur', async () => {
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 1, role: 'avocat', permissions: ['SUPER_ADMIN'] }) as any),
    ).resolves.toBe(true);
  });
});

describe('AiTechnicalGuard', () => {
  const contextFor = (user: Record<string, unknown>) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  });

  it('réserve les endpoints techniques au super administrateur', () => {
    const guard = new AiTechnicalGuard();
    expect(() => guard.canActivate(contextFor({ role: 'admin', permissions: ['use_ai_assistant'] }) as any))
      .toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor({ permissions: ['SUPER_ADMIN'] }) as any)).toBe(true);
  });
});

describe('AiDatabaseController — gardes', () => {
  const guardsOf = (target: object) =>
    (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as unknown[];

  it('protège tout le contrôleur par AiFeatureGuard', () => {
    expect(guardsOf(AiDatabaseController)).toContain(AiFeatureGuard);
  });

  it.each([
    'executeCustomQuery',
    'getMetrics',
    'getDatabaseSchemaJSON',
    'getDatabaseSchema',
    'getPromptSchema',
    'getVisibleTables',
  ])('réserve %s au super administrateur', (method) => {
    const handler = (AiDatabaseController.prototype as any)[method];
    expect(guardsOf(handler)).toContain(AiTechnicalGuard);
  });
});
