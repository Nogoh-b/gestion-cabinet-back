/**
 * Connexion globale (/auth/login sans cabinet) :
 * - validateUser() résout le tenant depuis le premier employé correspondant,
 *   SANS filtre tenant actif (recherche globale).
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

function buildService(
  overrides: {
    user?: any;
    employee?: any;
    employeeError?: Error | null;
    cabinetCode?: string | null;
  } = {},
) {
  const {
    user,
    employee,
    employeeError = null,
    cabinetCode = 'xk7m2p8a',
  } = overrides;

  const seenTenantDuringEmployeeLookup: Array<number | 'no-context'> = [];
  const employeeService = {
    findByEmail: jest.fn(async (_email: string, _strict?: boolean) => {
      seenTenantDuringEmployeeLookup.push(
        hasActiveTenant() ? getCurrentTenantId() : 'no-context',
      );
      if (employeeError) throw employeeError;
      return employee ?? null;
    }),
  };

  const usersService = {
    findByEmail: jest.fn(async (_email: string) => {
      if (!user) throw new UnauthorizedException('missing');
      return user;
    }),
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
    seenTenantDuringEmployeeLookup,
  };
}

const baseUser = () => ({
  id: 11,
  email: 'avocat@cabinet.test',
  password: HASH,
  role: 'admin',
  mfa_enabled: false,
});

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

  it('validateUser sans tenant résout le tenant depuis le premier employé (recherche globale)', async () => {
    const { service, seenTenantDuringEmployeeLookup } = buildService({
      user: baseUser(),
      employee: {
        id: 11,
        email: 'avocat@cabinet.test',
        tenant_id: 7,
        status: 1,
      },
    });

    const result = await service.validateUser(
      'avocat@cabinet.test',
      PASSWORD,
      1,
    );

    expect(result._resolvedTenantId).toBe(7);
    // La recherche employé a eu lieu SANS contexte tenant (pas de filtre WHERE tenant_id)
    expect(seenTenantDuringEmployeeLookup).toEqual(['no-context']);
  });

  it('validateUser sans tenant et sans employé conserve le tenant par défaut (comportement inchangé)', async () => {
    const { service } = buildService({ user: baseUser(), employee: null });

    const result = await service.validateUser(
      'avocat@cabinet.test',
      PASSWORD,
      1,
    );

    expect(result._resolvedTenantId).toBe(1);
  });

  it('validateUser rejette un mot de passe invalide (avec ou sans tenant)', async () => {
    const { service } = buildService({
      user: baseUser(),
      employee: {
        id: 11,
        email: 'avocat@cabinet.test',
        tenant_id: 7,
        status: 1,
      },
    });

    await expect(
      service.validateUser('avocat@cabinet.test', 'MauvaisMdp!', 1),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validateUser avec tenant bloque le cross-tenant (régression)', async () => {
    const { service } = buildService({
      user: baseUser(),
      employeeError: new Error(
        'Employee with email avocat@cabinet.test not found',
      ),
    });

    await expect(
      service.validateUser('avocat@cabinet.test', PASSWORD, 5),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login global renvoie tenant_id + tenant_code et charge dans le bon tenant', async () => {
    const {
      service,
      employeeService,
      dataSource,
      seenTenantDuringEmployeeLookup,
    } = buildService({
      user: baseUser(),
      employee: {
        id: 11,
        email: 'avocat@cabinet.test',
        tenant_id: 7,
        status: 1,
      },
      cabinetCode: 'xk7m2p8a',
    });

    const validated = await service.validateUser(
      'avocat@cabinet.test',
      PASSWORD,
      1,
    );
    const session = (await service.login(validated)) as unknown as SessionOut;

    expect(session.access_token).toBe('signed-jwt');
    expect(session.tenant_id).toBe(7);
    expect(session.tenant_code).toBe('xk7m2p8a');
    expect(session.permissions).toEqual(['DOSSIER_READ']);
    // L'employé de session a été chargé DANS le contexte du tenant résolu
    expect(seenTenantDuringEmployeeLookup).toContain(7);
    expect(employeeService.findByEmail).toHaveBeenCalledWith(
      'avocat@cabinet.test',
    );
    expect(dataSource.query).toHaveBeenCalled();
  });

  it('login global réussit même si le code cabinet est introuvable (tenant_code null)', async () => {
    const { service } = buildService({
      user: baseUser(),
      employee: {
        id: 11,
        email: 'avocat@cabinet.test',
        tenant_id: 7,
        status: 1,
      },
      cabinetCode: null,
    });

    const validated = await service.validateUser(
      'avocat@cabinet.test',
      PASSWORD,
      1,
    );
    const session = (await service.login(validated)) as unknown as SessionOut;

    expect(session.access_token).toBe('signed-jwt');
    expect(session.tenant_id).toBe(7);
    expect(session.tenant_code).toBeNull();
  });
});
