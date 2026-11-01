import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AiFeatureGuard } from './ai-feature.guard';

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

  it('reste fermee par defaut', async () => {
    delete process.env.AI_ENABLED;
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ role: 'admin' }) as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuse un non-administrateur meme avec la permission IA', async () => {
    process.env.AI_ENABLED = 'true';
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({
        id: 2,
        role: 'avocat',
        permissions: ['use_ai_assistant'],
      }) as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exige la permission IA explicite pour un administrateur', async () => {
    process.env.AI_ENABLED = 'true';
    usersService.getUserPermissions.mockResolvedValue([]);
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 1, role: 'admin', permissions: [] }) as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepte un administrateur autorise et recharge les anciens JWT', async () => {
    process.env.AI_ENABLED = 'true';
    usersService.getUserPermissions.mockResolvedValue([
      { code: 'use_ai_assistant' },
    ]);
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({ id: 1, role: 'admin', permissions: [] }) as any),
    ).resolves.toBe(true);
  });

  it('accepte le super administrateur', async () => {
    process.env.AI_ENABLED = 'true';
    const guard = new AiFeatureGuard(usersService as any);

    await expect(
      guard.canActivate(contextFor({
        id: 1,
        role: 'avocat',
        permissions: ['SUPER_ADMIN'],
      }) as any),
    ).resolves.toBe(true);
  });
});
