import { Reflector } from '@nestjs/core';
import { PlatformRolesGuard } from '../auth/platform-auth.guard';
import { PlatformReferenceDataController } from './platform-reference-data.controller';

describe('Reference platform access', () => {
  const guard = new PlatformRolesGuard(new Reflector());
  function context(method: string, role: string, isPlatform = true) {
    return {
      getClass: () => PlatformReferenceDataController,
      getHandler: () => PlatformReferenceDataController.prototype[method],
      switchToHttp: () => ({
        getRequest: () => ({ user: { role, isPlatform } }),
      }),
    } as any;
  }
  it('lets support read and ask for explanations but rejects every mutation', () => {
    for (const method of ['list', 'detail', 'history', 'ask', 'deployment'])
      expect(guard.canActivate(context(method, 'support'))).toBe(true);
    for (const method of [
      'create',
      'draft',
      'discard',
      'save',
      'rolePermissions',
      'publish',
      'restore',
      'setDefault',
      'archive',
      'preview',
      'apply',
      'retry',
      'accept',
    ])
      expect(() => guard.canActivate(context(method, 'support'))).toThrow();
  });
  it('excludes finance and cabinet tokens', () => {
    expect(() => guard.canActivate(context('list', 'finance'))).toThrow();
    expect(() => guard.canActivate(context('list', 'admin', false))).toThrow();
  });
  it('allows the owner to publish and apply configurations', () => {
    expect(guard.canActivate(context('publish', 'owner'))).toBe(true);
    expect(guard.canActivate(context('apply', 'owner'))).toBe(true);
  });
});
