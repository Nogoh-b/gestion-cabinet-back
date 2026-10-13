/**
 * PermissionsGuard — les codes plateforme (manage_cabinets, *_plan…) ne sont
 * jamais accordés à un utilisateur de cabinet, même admin ou SUPER_ADMIN.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { PermissionsGuard } from './permissions.guard';

function contextFor(user: any, required: string[] | undefined) {
  const reflector: any = { getAllAndOverride: jest.fn(() => required) };
  const audit: any = { record: jest.fn(async () => undefined) };
  const guard = new PermissionsGuard(reflector, {} as any, audit);
  const ctx: any = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'GET', originalUrl: '/x' }),
    }),
  };
  return { guard, ctx, audit };
}

describe('PermissionsGuard', () => {
  it('laisse passer un admin de cabinet sur un code cabinet', async () => {
    const { guard, ctx } = contextFor(
      { role: 'admin', permissions: [] },
      ['view_dossiers'],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('refuse un admin de cabinet sur un code plateforme', async () => {
    const { guard, ctx, audit } = contextFor(
      { role: 'admin', permissions: [] },
      ['manage_cabinets'],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(audit.record).toHaveBeenCalled();
  });

  it('refuse SUPER_ADMIN de cabinet sur un code plateforme', async () => {
    const { guard, ctx } = contextFor(
      { role: 'avocat', permissions: ['SUPER_ADMIN', 'create_plan'] },
      ['create_plan'],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('SUPER_ADMIN de cabinet garde tous les droits cabinet', async () => {
    const { guard, ctx } = contextFor(
      { role: 'avocat', permissions: ['SUPER_ADMIN'] },
      ['delete_dossier'],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('exige toutes les permissions listées', async () => {
    const { guard, ctx } = contextFor(
      { role: 'avocat', permissions: ['view_dossiers'] },
      ['view_dossiers', 'edit_dossier'],
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });
});
