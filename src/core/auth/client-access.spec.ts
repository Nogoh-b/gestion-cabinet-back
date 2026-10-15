/**
 * Cloisonnement du portail client (rôle `client`) :
 * - refus par défaut (403) de toute route authentifiée non marquée
 *   @AllowClient(), même sans contrôle de permission ;
 * - les rôles du cabinet ne sont pas concernés ;
 * - la liste blanche ne contient que des routes bornées aux données du client ;
 * - GET /api/settings/app ne renvoie au client ni le SMTP ni la configuration
 *   interne du cabinet ;
 * - pas de connexion temps réel (WebSocket) pour un client.
 *
 * Note : les globals jest sont importés explicitement car le tsconfig du
 * projet restreint `types` (pas de @types/jest global sous ts-jest).
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALLOW_CLIENT_KEY,
  AllowClient,
} from '../decorators/allow-client.decorator';
import { Public } from '../decorators/public.decorator';
import { MarkPlatformRoute } from '../decorators/platform.decorator';
import { PublicGuard } from '../decorators/public.guard';
import { assertClientRouteAllowed, isClientUser } from './client-access';
import { AuthController } from './auth.controller';
import { DossiersController } from 'src/modules/dossiers/dossiers.controller';
import { AppSettingsController } from 'src/modules/settings/controllers/app-settings.controller';
import { UserSettingsController } from 'src/modules/settings/controllers/user-settings.controller';
import { ChatController } from 'src/modules/chat/controller/chat/chat.controller';
import { MainGateway } from '../shared/services/socket/main.gateway';

const CLIENT = {
  id: 50,
  userId: 50,
  role: 'client',
  customerId: 83,
  tenantId: 25,
};
const STAFF_ROLES = [
  'admin',
  'avocat',
  'secretaire',
  'comptable',
  'collaborateur',
];

class PortalTestController {
  @AllowClient()
  mine() {}

  staffOnly() {}

  @Public()
  open() {}

  @MarkPlatformRoute()
  platform() {}
}

@AllowClient()
class OpenTestController {
  list() {}
}

function httpContext(handler: Function, cls: Function, user?: any) {
  const request: any = { user };
  return {
    request,
    context: {
      getHandler: () => handler,
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

const reflector = new Reflector();

describe('assertClientRouteAllowed', () => {
  it('refuse un client sur une route non marquée', () => {
    const { context } = httpContext(
      PortalTestController.prototype.staffOnly,
      PortalTestController,
      CLIENT,
    );
    expect(() => assertClientRouteAllowed(reflector, context)).toThrow(
      ForbiddenException,
    );
  });

  it('laisse passer un client sur une route marquée (méthode ou contrôleur)', () => {
    const onMethod = httpContext(
      PortalTestController.prototype.mine,
      PortalTestController,
      CLIENT,
    );
    const onClass = httpContext(
      OpenTestController.prototype.list,
      OpenTestController,
      CLIENT,
    );
    expect(() =>
      assertClientRouteAllowed(reflector, onMethod.context),
    ).not.toThrow();
    expect(() =>
      assertClientRouteAllowed(reflector, onClass.context),
    ).not.toThrow();
  });

  it.each(STAFF_ROLES)('ne change rien pour le rôle %s', (role) => {
    const { context } = httpContext(
      PortalTestController.prototype.staffOnly,
      PortalTestController,
      { id: 48, role },
    );
    expect(() => assertClientRouteAllowed(reflector, context)).not.toThrow();
  });

  it('ignore une requête sans utilisateur (routes publiques)', () => {
    const { context } = httpContext(
      PortalTestController.prototype.staffOnly,
      PortalTestController,
      undefined,
    );
    expect(() => assertClientRouteAllowed(reflector, context)).not.toThrow();
  });

  it('isClientUser ne reconnaît que le rôle client', () => {
    expect(isClientUser(CLIENT)).toBe(true);
    expect(isClientUser({ role: 'admin' })).toBe(false);
    expect(isClientUser(null)).toBe(false);
  });
});

describe('PublicGuard (guard global)', () => {
  const jwtCanActivate = jest.spyOn(
    Object.getPrototypeOf(PublicGuard.prototype),
    'canActivate',
  );
  let authenticatedUser: any;
  const guard = new PublicGuard(reflector);

  beforeEach(() => {
    authenticatedUser = CLIENT;
    // Simule passport-jwt : pose req.user puis accepte la requête.
    jwtCanActivate.mockImplementation(async function (ctx: ExecutionContext) {
      ctx.switchToHttp().getRequest().user = authenticatedUser;
      return true;
    } as any);
  });

  afterEach(() => {
    jwtCanActivate.mockReset();
  });

  it('refuse un client sur une route authentifiée non marquée', async () => {
    const { context } = httpContext(
      PortalTestController.prototype.staffOnly,
      PortalTestController,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuse un client sur une route du cabinet réelle (GET /dossiers/stats)', async () => {
    const { context } = httpContext(
      DossiersController.prototype.getStats,
      DossiersController,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('accepte un client sur GET /dossiers (liste blanche)', async () => {
    const { context } = httpContext(
      DossiersController.prototype.findAll,
      DossiersController,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each(STAFF_ROLES)(
    'laisse passer le rôle %s sur une route non marquée',
    async (role) => {
      authenticatedUser = { id: 48, role };
      const { context } = httpContext(
        DossiersController.prototype.getStats,
        DossiersController,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );

  it('routes publiques et plateforme : sans jeton cabinet, inchangé', async () => {
    const open = httpContext(
      PortalTestController.prototype.open,
      PortalTestController,
    );
    const platform = httpContext(
      PortalTestController.prototype.platform,
      PortalTestController,
    );
    await expect(guard.canActivate(open.context)).resolves.toBe(true);
    await expect(guard.canActivate(platform.context)).resolves.toBe(true);
    expect(jwtCanActivate).not.toHaveBeenCalled();
  });

  it("propage l'échec d'authentification", async () => {
    jwtCanActivate.mockRejectedValue(new Error('Unauthorized') as never);
    const { context } = httpContext(
      DossiersController.prototype.findAll,
      DossiersController,
    );
    await expect(guard.canActivate(context)).rejects.toThrow('Unauthorized');
  });
});

describe('Liste blanche du portail client', () => {
  const isAllowed = (cls: Function, handler: string) =>
    reflector.getAllAndOverride<boolean>(ALLOW_CLIENT_KEY, [
      (cls.prototype as any)[handler],
      cls,
    ]) === true;

  it.each([
    [AuthController, 'getProfile'],
    [AuthController, 'getMyPermissions'],
    [AuthController, 'logout'],
    [AuthController, 'changePassword'],
    [DossiersController, 'findAll'],
    [DossiersController, 'findOne'],
    [AppSettingsController, 'get'],
    [UserSettingsController, 'get'],
    [UserSettingsController, 'update'],
    [ChatController, 'getUserConversations'],
  ])('%p.%s est ouverte au client', (cls, handler) => {
    expect(isAllowed(cls, handler)).toBe(true);
  });

  // Routes qui renvoient des données d'autres clients ou de l'administration
  // du cabinet (constat de l'audit) : elles doivent rester fermées.
  it.each([
    [DossiersController, 'getStats'],
    [DossiersController, 'getStatsForDossier'],
    [DossiersController, 'getStatistics'],
    [DossiersController, 'getDossiersByCollaborator'],
    [DossiersController, 'closureRecap'],
    [DossiersController, 'getStageVisits'],
    [DossiersController, 'search'],
    [DossiersController, 'findAllPaginated'],
    [AuthController, 'enableMfa'],
    [AppSettingsController, 'update'],
    [AppSettingsController, 'testSmtp'],
    [ChatController, 'getConversationMessages'],
    [ChatController, 'createConversation'],
    [ChatController, 'sendMessage'],
  ])('%p.%s reste fermée au client', (cls, handler) => {
    expect(isAllowed(cls, handler)).toBe(false);
  });

  // Toute extension de la liste blanche doit être revue (la route ne doit
  // renvoyer que les données du client) puis reportée ici.
  it("aucune autre route n'est marquée @AllowClient()", () => {
    const srcRoot = path.join(__dirname, '..', '..');
    const found: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts')
        ) {
          // Décorateurs uniquement (en début de ligne), pas les commentaires.
          const count = (
            fs.readFileSync(full, 'utf8').match(/^\s*@AllowClient\(\)/gm) ?? []
          ).length;
          if (count > 0) {
            found[path.relative(srcRoot, full).split(path.sep).join('/')] =
              count;
          }
        }
      }
    };
    walk(srcRoot);

    expect(found).toEqual({
      'core/auth/auth.controller.ts': 4,
      'modules/dossiers/dossiers.controller.ts': 2,
      'modules/settings/controllers/app-settings.controller.ts': 1,
      'modules/settings/controllers/user-settings.controller.ts': 1,
      'modules/chat/controller/chat/chat.controller.ts': 1,
    });
  });
});

describe('GET /api/settings/app', () => {
  const cabinet = {
    id: 25,
    code: 'm05sdnfv',
    name: 'Cabinet Test',
    status: 'active',
    plan_id: 3,
    logo: null,
    logo_mime: null,
    logo_file: null,
    brand_color: '#123456',
    theme_name: 'midnight',
    currency: 'XAF',
    bank_account: 'CM21 0000',
    invoice_prefix: 'FAC-',
    smtp_config: { host: 'smtp.test', user: 'u', pass: 'secret-smtp' },
    ai_config: { provider: 'x' },
  };
  const appSettingsService = {
    findByCabinet: jest.fn(async () => ({ ...cabinet })),
  };
  const controller = new AppSettingsController(
    appSettingsService as any,
    {} as any,
    {} as any,
  );

  it('client : identité et apparence seulement, ni SMTP ni configuration interne', async () => {
    const body = await controller.get({ user: CLIENT } as any);
    expect(body).toEqual({
      id: 25,
      code: 'm05sdnfv',
      name: 'Cabinet Test',
      logo_url: null,
      brand_color: '#123456',
      theme_name: 'midnight',
      currency: 'XAF',
    });
  });

  it('personnel du cabinet : réponse inchangée (hors ai_config)', async () => {
    const body = await controller.get({
      user: { id: 48, role: 'admin', tenantId: 25 },
    } as any);
    expect(body).toMatchObject({
      smtp_config: cabinet.smtp_config,
      invoice_prefix: 'FAC-',
      bank_account: 'CM21 0000',
      status: 'active',
    });
    expect(body).not.toHaveProperty('ai_config');
  });
});

describe('MainGateway : connexion temps réel', () => {
  function buildGateway(role: string) {
    const userService = {
      findSessionState: jest.fn(async () => ({
        id: 50,
        status: 1,
        role,
        employee: null,
      })),
      update: jest.fn(async () => undefined),
    };
    const gateway = new MainGateway(
      { setReceiveMessagesWithCount: jest.fn(async () => undefined) } as any,
      { getUnreadNotifications: jest.fn(async () => []) } as any,
      userService as any,
      { verifyAsync: jest.fn(async () => ({ sub: 50, tenantId: 25 })) } as any,
    );
    gateway.server = { emit: jest.fn() } as any;
    const socket = {
      id: 'socket-1',
      handshake: { auth: { token: 'jwt' } },
      data: {} as any,
      join: jest.fn(async () => undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    return { gateway, socket };
  }

  it('refuse un compte client (déconnexion, aucune room)', async () => {
    const { gateway, socket } = buildGateway('client');
    await gateway.handleConnection(socket as any);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('accepte le personnel du cabinet (inchangé)', async () => {
    const { gateway, socket } = buildGateway('avocat');
    await gateway.handleConnection(socket as any);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('user_50');
  });
});
