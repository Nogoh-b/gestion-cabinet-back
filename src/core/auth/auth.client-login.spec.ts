/**
 * Connexion des comptes du portail client (rôle `client`) :
 * - pas de fiche employé : l'appartenance au cabinet se vérifie sur le compte
 *   (user.tenant_id) ET sur la fiche client liée (customer.tenant_id) ;
 * - le JWT porte sub = id du compte (relu par JwtStrategy), customerId = fiche
 *   client (filtre des dossiers) et les permissions du rôle client du cabinet ;
 * - les rôles du cabinet gardent le contrôle par fiche employé (inchangé).
 *
 * Note : les globals jest sont importés explicitement car le tsconfig du
 * projet restreint `types` (pas de @types/jest global sous ts-jest).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  getCurrentTenantId,
  hasActiveTenant,
  TenantContext,
} from '../tenant/tenant.context';

const PASSWORD = 'Secret123!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const CABINET = 25;
const OTHER_CABINET = 7;

const clientUser = (overrides: Record<string, unknown> = {}) => ({
  id: 50,
  email: 'client@cabinet.test',
  password: HASH,
  refreshToken: 'hash-du-refresh',
  role: 'client',
  status: 1,
  mfa_enabled: false,
  tenant_id: CABINET,
  employee: null,
  customer: { id: 83, tenant_id: CABINET, status: 1 },
  ...overrides,
});

const employeeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 48,
  email: 'avocat@cabinet.test',
  password: HASH,
  role: 'admin',
  status: 1,
  mfa_enabled: false,
  tenant_id: CABINET,
  customer: null,
  ...overrides,
});

function buildService(
  overrides: { user?: any; employee?: any; cabinetCode?: string | null } = {},
) {
  const { user, employee = null, cabinetCode = 'm05sdnfv' } = overrides;

  const lookups: Array<{ method: string; tenant: number | 'no-context' }> = [];
  const snap = (method: string) =>
    lookups.push({
      method,
      tenant: hasActiveTenant() ? getCurrentTenantId() : 'no-context',
    });

  const employeeService = {
    findByEmail: jest.fn(async (_email: string, _strict?: boolean) => {
      snap('employee.findByEmail');
      return employee;
    }),
    findOne: jest.fn(async (_id: number) => {
      snap('employee.findOne');
      return employee;
    }),
  };

  const usersService = {
    findByEmail: jest.fn(async (_email: string) => {
      if (!user) throw new UnauthorizedException('missing');
      return user;
    }),
    findAllByEmail: jest.fn(async (_email: string) => (user ? [user] : [])),
    getPermissionsByRoleCode: jest.fn(async (role: string | null) => {
      snap('permissions');
      return role === 'client'
        ? [{ code: 'view_dossiers' }, { code: 'view_documents' }]
        : [{ code: 'DOSSIER_READ' }];
    }),
  };

  const jwtService = { sign: jest.fn((_payload: any) => 'signed-jwt') };
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

  return { service, usersService, employeeService, jwtService, lookups };
}

/** Forme du retour de login() (branche session, hors challenge MFA). */
interface SessionOut {
  access_token: string;
  user: Record<string, any>;
  permissions: string[];
  tenant_id: number;
  tenant_code: string | null;
}

describe('AuthService — connexion des comptes client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('client du bon cabinet', () => {
    it('validateUser accepte le client sans chercher de fiche employé', async () => {
      const { service, employeeService } = buildService({
        user: clientUser(),
      });

      const result = await service.validateUser(
        'client@cabinet.test',
        PASSWORD,
        CABINET,
      );

      expect(result.id).toBe(50);
      expect(result._resolvedTenantId).toBe(CABINET);
      expect(result.password).toBeUndefined();
      expect(employeeService.findByEmail).not.toHaveBeenCalled();
    });

    it('login signe un JWT client : sub = compte, customerId, permissions du rôle client', async () => {
      const { service, jwtService, employeeService, lookups } = buildService(
        { user: clientUser() },
      );

      const validated = await service.validateUser(
        'client@cabinet.test',
        PASSWORD,
        CABINET,
      );
      const session = (await service.login(validated)) as unknown as SessionOut;

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 50,
        username: 'client@cabinet.test',
        role: 'client',
        permissions: ['view_dossiers', 'view_documents'],
        customerId: 83,
        tenantId: CABINET,
      });
      // Permissions du rôle client lues DANS le cabinet de session.
      expect(lookups).toContainEqual({ method: 'permissions', tenant: CABINET });
      expect(employeeService.findByEmail).not.toHaveBeenCalled();

      expect(session.access_token).toBe('signed-jwt');
      expect(session.tenant_id).toBe(CABINET);
      expect(session.tenant_code).toBe('m05sdnfv');
      expect(session.user.role).toBe('client');
      expect(session.user.customer).toEqual({
        id: 83,
        tenant_id: CABINET,
        status: 1,
      });
    });

    it("login n'expose ni mot de passe ni refresh token (entité complète, cas verifyMfa)", async () => {
      const { service } = buildService();

      const session = (await service.login({
        ...clientUser(),
        _resolvedTenantId: CABINET,
      })) as unknown as SessionOut;

      expect(session.user.password).toBeUndefined();
      expect(session.user.refreshToken).toBeUndefined();
      expect(session.user._resolvedTenantId).toBeUndefined();
      expect(session.user.id).toBe(50);
    });

    it('connexion globale : le cabinet est celui du compte client', async () => {
      const { service, jwtService, employeeService } = buildService({
        user: clientUser(),
      });

      const validated = await service.validateUser(
        'client@cabinet.test',
        PASSWORD,
        1,
      );
      const session = (await service.login(validated)) as unknown as SessionOut;

      expect(validated._resolvedTenantId).toBe(CABINET);
      expect(session.tenant_code).toBe('m05sdnfv');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: CABINET, customerId: 83 }),
      );
      expect(employeeService.findOne).not.toHaveBeenCalled();
    });
  });

  describe("client d'un autre cabinet", () => {
    it('validateUser refuse un compte client rattaché à un autre cabinet', async () => {
      const { service } = buildService({
        user: clientUser({ tenant_id: OTHER_CABINET }),
      });

      await expect(
        service.validateUser('client@cabinet.test', PASSWORD, CABINET),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("validateUser refuse un compte dont la fiche client relève d'un autre cabinet", async () => {
      const { service } = buildService({
        user: clientUser({
          customer: { id: 83, tenant_id: OTHER_CABINET, status: 1 },
        }),
      });

      await expect(
        service.validateUser('client@cabinet.test', PASSWORD, CABINET),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('validateUser refuse un compte client sans fiche client', async () => {
      const { service } = buildService({
        user: clientUser({ customer: null }),
      });

      await expect(
        service.validateUser('client@cabinet.test', PASSWORD, CABINET),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("issueSession refuse d'ouvrir une session client dans un autre cabinet", async () => {
      const { service, jwtService } = buildService();

      await expect(
        service.login({ ...clientUser(), _resolvedTenantId: OTHER_CABINET }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('refuse un compte client bloqué ou une fiche client suspendue', async () => {
      const blocked = buildService({ user: clientUser({ status: 0 }) });
      await expect(
        blocked.service.validateUser('client@cabinet.test', PASSWORD, CABINET),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const suspended = buildService({
        user: clientUser({
          customer: { id: 83, tenant_id: CABINET, status: -3 },
        }),
      });
      await expect(
        suspended.service.validateUser(
          'client@cabinet.test',
          PASSWORD,
          CABINET,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('employé du cabinet (inchangé)', () => {
    it('validateUser exige toujours la fiche employé, cherchée dans le cabinet', async () => {
      const { service, employeeService, lookups } = buildService({
        user: employeeUser(),
        employee: { id: 48, email: 'avocat@cabinet.test', tenant_id: CABINET },
      });

      const result = await service.validateUser(
        'avocat@cabinet.test',
        PASSWORD,
        CABINET,
      );

      expect(result._resolvedTenantId).toBe(CABINET);
      expect(employeeService.findByEmail).toHaveBeenCalledWith(
        'avocat@cabinet.test',
        false,
      );
      expect(lookups).toContainEqual({
        method: 'employee.findByEmail',
        tenant: CABINET,
      });
    });

    it('validateUser refuse un rôle du cabinet sans fiche employé, même lié à une fiche client', async () => {
      const { service } = buildService({
        user: employeeUser({
          customer: { id: 83, tenant_id: CABINET, status: 1 },
        }),
        employee: null,
      });

      await expect(
        service.validateUser('avocat@cabinet.test', PASSWORD, CABINET),
      ).rejects.toThrow('Aucun employé trouvé pour ce cabinet');
    });

    it("login signe toujours le JWT depuis la fiche employé", async () => {
      const { service, jwtService, employeeService } = buildService({
        user: employeeUser(),
        employee: {
          id: 48,
          email: 'avocat@cabinet.test',
          tenant_id: CABINET,
          status: 1,
        },
      });

      const validated = await service.validateUser(
        'avocat@cabinet.test',
        PASSWORD,
        CABINET,
      );
      const session = (await service.login(validated)) as unknown as SessionOut;

      expect(employeeService.findByEmail).toHaveBeenLastCalledWith(
        'avocat@cabinet.test',
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 48,
        username: 'avocat@cabinet.test',
        role: 'admin',
        permissions: ['DOSSIER_READ'],
        customerId: null,
        tenantId: CABINET,
      });
      expect(session.user.role).toBe('admin');
      expect(session.tenant_id).toBe(CABINET);
    });
  });
});
