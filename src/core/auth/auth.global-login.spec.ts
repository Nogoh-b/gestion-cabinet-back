/**
 * Connexion globale (/auth/login sans cabinet) avec e-mails dupliqués :
 * - validateUser() teste le mot de passe sur CHAQUE compte partageant
 *   l'e-mail (id ASC) et retient le premier qui matche — jamais la première
 *   ligne arbitraire d'un findOne.
 * - le tenant est déduit de l'employé lié à CE compte (même id), sans filtre.
 * - login() renvoie tenant_id + tenant_code pour rediriger vers /t/[code]/dashboard.
 *
 * Note : les globals jest sont importés explicitement car le tsconfig du
 * projet restreint `types` (pas de @types/jest global sous ts-jest).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  getCurrentTenantId,
  hasActiveTenant,
  TenantContext,
} from '../tenant/tenant.context';

const PASSWORD = 'Secret123!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const EMAIL = 'avocat@cabinet.test';

const baseUser = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  email: EMAIL,
  password: HASH,
  role: 'admin',
  mfa_enabled: false,
  ...overrides,
});

function buildService(
  overrides: {
    users?: any[];
    user?: any;
    employee?: any;
    employeeError?: Error | null;
    cabinetCode?: string | null;
  } = {},
) {
  const {
    users,
    user,
    employee,
    employeeError = null,
    cabinetCode = 'xk7m2p8a',
  } = overrides;
  const accounts = users ?? (user ? [user] : []);

  const lookups: Array<{ method: string; tenant: number | 'no-context' }> = [];
  const snap = (method: string) =>
    lookups.push({
      method,
      tenant: hasActiveTenant() ? getCurrentTenantId() : 'no-context',
    });

  const employeeService = {
    findByEmail: jest.fn(async (_email: string, _strict?: boolean) => {
      snap('findByEmail');
      if (employeeError) throw employeeError;
      return employee ?? null;
    }),
    findOne: jest.fn(async (_id: number) => {
      snap('findOne');
      if (employeeError) throw employeeError;
      return employee ?? null;
    }),
  };

  const usersService = {
    findByEmail: jest.fn(async (_email: string) => {
      if (!user && accounts.length === 0)
        throw new UnauthorizedException('missing');
      return user ?? accounts[0] ?? null;
    }),
    findAllByEmail: jest.fn(async (_email: string) => accounts),
    getPermissionsByRoleCode: jest.fn(async (_role: string | null) => [
      { code: 'DOSSIER_READ' },
    ]),
  };

  const jwtService = { sign: jest.fn((_p: any) => 'signed-jwt') };
  const dataSource = {
    query: jest.fn(async (_sql: string, _params?: any[]) =>
      cabinetCode ? [{ code: cabinetCode }] : [],
    ),
  };

  const service = new AuthService(
    usersService as any,
    employeeService as any,
    jwtService as any,
    {} as any, // mailService (inutilisé ici)
    {} as any, // authTokenService (inutilisé ici)
    new TenantContext(),
    {} as any, // mailTemplateService (inutilisé ici)
    dataSource as unknown as DataSource,
  );

  return {
    service,
    usersService,
    employeeService,
    jwtService,
    dataSource,
    lookups,
  };
}

/** Forme du retour de login() (branche session, hors challenge MFA). */
interface SessionOut {
  access_token: string;
  tenant_id: number;
  tenant_code: string | null;
  permissions: unknown;
}

describe('AuthService — connexion globale sans cabinet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retient le premier compte dont le mot de passe matche (cas des 9 doublons)', async () => {
    const wrong = baseUser({
      id: 4,
      password: bcrypt.hashSync('AutreMdp!', 4),
    });
    const good = baseUser({ id: 31, password: HASH });
    const { service, usersService, employeeService, lookups } = buildService({
      users: [wrong, good],
      employee: { id: 31, email: EMAIL, tenant_id: 22, status: 1 },
      cabinetCode: 'pwcp202s',
    });

    const result = await service.validateUser(EMAIL, PASSWORD, 1);

    expect(result.id).toBe(31);
    expect(result._resolvedTenantId).toBe(22);
    // Recherche globale : tous les comptes, puis l'employé lié par id.
    expect(usersService.findAllByEmail).toHaveBeenCalledWith(EMAIL);
    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(employeeService.findOne).toHaveBeenCalledWith(31);
    expect(lookups.filter((l) => l.method === 'findOne')).toEqual([
      { method: 'findOne', tenant: 'no-context' },
    ]);
  });

  it('rejette quand aucun compte ne matche le mot de passe', async () => {
    const { service } = buildService({
      users: [
        baseUser({ id: 4, password: bcrypt.hashSync('Mdp-A!', 4) }),
        baseUser({ id: 13, password: bcrypt.hashSync('Mdp-B!', 4) }),
      ],
      employee: null,
    });

    await expect(
      service.validateUser(EMAIL, PASSWORD, 1),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette quand aucun compte ne porte cet e-mail', async () => {
    const { service, usersService } = buildService({ users: [] });

    await expect(
      service.validateUser(EMAIL, PASSWORD, 1),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findAllByEmail).toHaveBeenCalledWith(EMAIL);
  });

  it('sans employé lié, conserve le tenant par défaut (comportement inchangé)', async () => {
    const { service } = buildService({
      users: [baseUser()],
      employee: null,
    });

    const result = await service.validateUser(EMAIL, PASSWORD, 1);

    expect(result._resolvedTenantId).toBe(1);
  });

  it('validateUser avec tenant bloque le cross-tenant (régression)', async () => {
    const { service } = buildService({
      user: baseUser(),
      employeeError: new Error(`Employee with email ${EMAIL} not found`),
    });

    await expect(
      service.validateUser(EMAIL, PASSWORD, 5),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login global ouvre la session du bon cabinet malgré les doublons', async () => {
    const { service, employeeService, dataSource, lookups } = buildService({
      users: [
        baseUser({ id: 4, password: bcrypt.hashSync('AutreMdp!', 4) }),
        baseUser({ id: 31, password: HASH }),
      ],
      employee: { id: 31, email: EMAIL, tenant_id: 22, status: 1 },
      cabinetCode: 'pwcp202s',
    });

    const validated = await service.validateUser(EMAIL, PASSWORD, 1);
    const session = (await service.login(validated)) as unknown as SessionOut;

    expect(session.access_token).toBe('signed-jwt');
    expect(session.tenant_id).toBe(22);
    expect(session.tenant_code).toBe('pwcp202s');
    expect(session.permissions).toEqual(['DOSSIER_READ']);
    // L'employé de session a été chargé DANS le contexte du tenant résolu.
    expect(lookups.filter((l) => l.method === 'findByEmail')).toContainEqual({
      method: 'findByEmail',
      tenant: 22,
    });
    expect(dataSource.query).toHaveBeenCalled();
  });

  it('login global réussit même si le code cabinet est introuvable (tenant_code null)', async () => {
    const { service } = buildService({
      users: [baseUser({ id: 31 })],
      employee: { id: 31, email: EMAIL, tenant_id: 22, status: 1 },
      cabinetCode: null,
    });

    const validated = await service.validateUser(EMAIL, PASSWORD, 1);
    const session = (await service.login(validated)) as unknown as SessionOut;

    expect(session.access_token).toBe('signed-jwt');
    expect(session.tenant_id).toBe(22);
    expect(session.tenant_code).toBeNull();
  });
});
