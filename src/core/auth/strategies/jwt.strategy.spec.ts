/**
 * JwtStrategy.validate() — les permissions viennent de la BASE (rôle du
 * cabinet du jeton), jamais du claim `permissions` figé dans le JWT (signé
 * pour 30 jours). Sans ça, retirer/accorder une permission n'a aucun effet
 * côté API avant reconnexion.
 *
 * Note : les globals jest sont importés explicitement (tsconfig `types`
 * restreint, cf. auth.global-login.spec.ts).
 */
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

const TENANT = 1;

function buildStrategy(opts: {
  sessionUser: any;
  rolePermissions: string[];
}) {
  const usersService: any = {
    findSessionState: jest.fn(async () => opts.sessionUser),
    getPermissionsByRoleCode: jest.fn(async () =>
      opts.rolePermissions.map((code) => ({ code })),
    ),
  };
  const tenantContext: any = {
    run: jest.fn((_tenantId: number, fn: () => any) => fn()),
  };
  const dataSource: any = {
    query: jest.fn(async () => (opts as any).session ? [(opts as any).session] : []),
  };
  const strategy = new JwtStrategy(usersService, tenantContext, dataSource);
  return { strategy, usersService, tenantContext };
}

const activeUser = {
  id: 7,
  status: 1,
  role: 'avocat',
  employee: { status: 'ACTIVE' },
};

function request(resolvedTenantId?: number, method = 'GET', originalUrl = '/dossiers') {
  return { resolvedTenantId, method, originalUrl } as any;
}

describe('JwtStrategy.validate — permissions fraîches', () => {
  beforeAll(() => {
    process.env.JWT_SECRET ??= 'test-only-secret';
  });

  it('ignore le claim permissions du JWT et relit le rôle en base', async () => {
    const { strategy, usersService } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: ['view_dashboard'],
    });

    const user = await strategy.validate(request(), {
      sub: 7,
      tenantId: TENANT,
      role: 'avocat',
      // Jeton périmé : contient une permission retirée depuis le login.
      permissions: ['view_users', 'view_dashboard'],
    });

    expect(user.permissions).toEqual(['view_dashboard']);
    expect(usersService.getPermissionsByRoleCode).toHaveBeenCalledWith('avocat');
  });

  it("applique le rôle en base (et non celui du jeton) pour les permissions", async () => {
    const { strategy, usersService } = buildStrategy({
      sessionUser: { ...activeUser, role: 'secretaire' },
      rolePermissions: ['view_factures'],
    });

    const user = await strategy.validate(request(), {
      sub: 7,
      tenantId: TENANT,
      role: 'avocat',
      permissions: [],
    });

    expect(user.role).toBe('secretaire');
    expect(user.permissions).toEqual(['view_factures']);
    expect(usersService.getPermissionsByRoleCode).toHaveBeenCalledWith('secretaire');
  });

  it('exécute la relecture des permissions dans le contexte du cabinet du jeton', async () => {
    const { strategy, tenantContext } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: [],
    });

    await strategy.validate(request(), { sub: 7, tenantId: 42, role: 'avocat' });

    expect(tenantContext.run).toHaveBeenCalledWith(42, expect.any(Function));
  });

  it('rejette un compte bloqué', async () => {
    const { strategy } = buildStrategy({
      sessionUser: { ...activeUser, status: 0 },
      rolePermissions: ['view_dashboard'],
    });

    await expect(
      strategy.validate(request(), { sub: 7, tenantId: TENANT, role: 'avocat' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bloque un jeton d un autre cabinet sans SUPER_ADMIN (fail-closed)', async () => {
    const { strategy } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: ['view_dashboard'],
    });

    await expect(
      strategy.validate(request(2), { sub: 7, tenantId: TENANT, role: 'avocat' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuse le cross-tenant même avec SUPER_ADMIN en base', async () => {
    const { strategy } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: ['SUPER_ADMIN'],
    });

    await expect(
      strategy.validate(request(2), {
        sub: 7,
        tenantId: TENANT,
        role: 'avocat',
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuse un jeton de l'espace plateforme", async () => {
    const { strategy, usersService } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: ['view_dashboard'],
    });

    await expect(
      strategy.validate(request(), { sub: 7, typ: 'platform', role: 'owner' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findSessionState).not.toHaveBeenCalled();
  });

  it('accepte une session support active et la signale sur req.user', async () => {
    const future = new Date(Date.now() + 3600_000);
    const { strategy } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: ['view_dashboard'],
      session: { id: 5, admin_id: 1, admin_email: 'support@plateforme.test', cabinet_id: TENANT, user_id: 7, expires_at: future, ended_at: null },
    } as any);
    const user: any = await strategy.validate(request(), { sub: 7, tenantId: TENANT, role: 'avocat', imp: 5 });
    expect(user.impersonation).toEqual(expect.objectContaining({ sessionId: 5, adminEmail: 'support@plateforme.test' }));
  });

  it('refuse une session support révoquée', async () => {
    const { strategy } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: [],
      session: { id: 5, admin_id: 1, admin_email: 'x', cabinet_id: TENANT, user_id: 7, expires_at: new Date(Date.now() + 3600_000), ended_at: new Date() },
    } as any);
    await expect(
      strategy.validate(request(), { sub: 7, tenantId: TENANT, role: 'avocat', imp: 5 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('interdit les actions sensibles pendant une session support', async () => {
    const { strategy } = buildStrategy({
      sessionUser: activeUser,
      rolePermissions: [],
      session: { id: 5, admin_id: 1, admin_email: 'x', cabinet_id: TENANT, user_id: 7, expires_at: new Date(Date.now() + 3600_000), ended_at: null },
    } as any);
    await expect(
      strategy.validate(request(undefined, 'POST', '/subscriptions/pay'), { sub: 7, tenantId: TENANT, role: 'avocat', imp: 5 }),
    ).rejects.toThrow(/session support/);
  });
});
