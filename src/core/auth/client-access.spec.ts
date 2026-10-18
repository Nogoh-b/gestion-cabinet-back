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
import {
  assertClientRouteAllowed,
  CLIENT_DOSSIER_VIEW,
  isClientUser,
  toClientDossierView,
} from './client-access';
import { getMetadataArgsStorage } from 'typeorm';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { AuthController } from './auth.controller';
import { DossiersController } from 'src/modules/dossiers/dossiers.controller';
import { AppSettingsController } from 'src/modules/settings/controllers/app-settings.controller';
import { UserSettingsController } from 'src/modules/settings/controllers/user-settings.controller';
import { ChatController } from 'src/modules/chat/controller/chat/chat.controller';
import { ClientAccessStaffController } from 'src/modules/client-portal/client-access.staff.controller';
import { ClientPortalController } from 'src/modules/client-portal/client-portal.controller';
import { DocumentCustomerController } from 'src/modules/documents/document-customer/document-customer.controller';
import { FactureController } from 'src/modules/facture/facture.controller';
import { NotificationController } from 'src/modules/notification/notification.controller';
import { PaiementController } from 'src/modules/paiement/paiement.controller';
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
    // Espace client (contrôleur entier) et notifications de l'appelant.
    [ClientPortalController, 'summary'],
    [ClientPortalController, 'uploadDocument'],
    [ClientPortalController, 'declarePayment'],
    [ClientPortalController, 'send'],
    [NotificationController, 'getMyNotifications'],
    [NotificationController, 'countUnread'],
    [NotificationController, 'getUnread'],
    [NotificationController, 'markAsRead'],
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
    // Côté cabinet : messagerie/accès d'un client, validation des paiements
    // et documents, factures et documents du cabinet.
    [ClientAccessStaffController, 'accessStatus'],
    [ClientAccessStaffController, 'messages'],
    [ClientAccessStaffController, 'reply'],
    [ClientAccessStaffController, 'markRead'],
    [PaiementController, 'valider'],
    [PaiementController, 'rejeter'],
    [PaiementController, 'create'],
    [DocumentCustomerController, 'validate'],
    [DocumentCustomerController, 'refuse'],
    [FactureController, 'search1'],
    [NotificationController, 'create'],
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
      // Espace client : contrôleur entier, chaque méthode bornée à customerId.
      'modules/client-portal/client-portal.controller.ts': 1,
      // Notifications de l'appelant : liste, non lues (x2), marquage lu.
      'modules/notification/notification.controller.ts': 4,
    });
  });
});

describe('Dossiers : projection pour le client (liste blanche)', () => {
  // Champs que les pages de l'espace client lisent (dossiers, dossiers/[id],
  // tableau de bord, messagerie). Toute extension se décide ici, pas par défaut.
  const CLIENT_FIELDS = [
    'audiences',
    'case_number',
    'closing_date',
    'court_name',
    'danger_level',
    'description',
    'dossier_number',
    'id',
    'jurisdiction',
    'lawyer',
    'object',
    'opening_date',
    'procedure_type',
    'status',
  ];

  /** Dossier complet tel que le renvoie le service : chaque colonne et relation. */
  function fullDossier(): Record<string, any> {
    const storage = getMetadataArgsStorage();
    const names = [
      ...storage.columns.filter((c) => c.target === Dossier),
      ...storage.relations.filter((r) => r.target === Dossier),
    ].map((meta) => meta.propertyName);

    const dossier: Record<string, any> = {};
    for (const name of names) dossier[name] = `interne:${name}`;
    return Object.assign(dossier, {
      id: 91,
      dossier_number: 'DOS-91',
      object: 'Litige commercial',
      description: 'Résumé',
      status: 'LITIGATION',
      danger_level: 1,
      opening_date: new Date('2026-01-10'),
      closing_date: null,
      court_name: 'Chambre civile',
      case_number: 'RC/1/2026',
      procedure_type: { id: 3, name: 'Civile', code: 'CIV', description: 'interne' },
      jurisdiction: { id: 2, name: 'TPI Douala', phone: '+237', email: 'tpi@x.cm' },
      lawyer: {
        id: 48,
        full_name: 'Me Lionel',
        email: 'lionel@cabinet.cm',
        specialization: 'Commercial',
        bar_association_number: 'BA1',
      },
      audiences: [
        {
          id: 7,
          audience_date: new Date('2026-03-12'),
          audience_time: '09:00',
          type: 0,
          status: 0,
          room: 'Salle 4',
          judge_name: 'Juge X',
          decision: 'interne',
          outcome: 'interne',
          notes: 'interne',
          report_content: 'interne',
        },
      ],
      documents: [{ id: 1, name: 'Note interne.pdf' }],
      factures: [{ id: 'f1', montant_ttc: 5000 }],
      collaborators: [{ id: 3 }],
      diligences: [{ id: 4 }],
      client: { id: 83, email: 'client@x.cm' },
    });
  }

  it("n'expose que les champs documentés, quelles que soient les colonnes du dossier", () => {
    const view = toClientDossierView(fullDossier());
    expect(Object.keys(view).sort()).toEqual(CLIENT_FIELDS);
    expect(Object.keys(CLIENT_DOSSIER_VIEW).sort()).toEqual(CLIENT_FIELDS);
  });

  it.each([
    'analysis_notes',
    'recommendation',
    'success_probability',
    'budget_estimate',
    'actual_costs',
    'procedure_costs',
    'settlement_amount',
    'settlement_terms',
    'damages_awarded',
    'costs_awarded',
    'outcome',
    'outcome_notes',
    'client_satisfaction',
    'client_decision',
    'opposing_party_name',
    'opposing_party_lawyer',
    'opposing_party_contact',
    'third_parties',
    'initial_request',
    'next_steps',
    'key_dates',
    'confidentiality_level',
    'priority_level',
    'diligences',
    'collaborators',
    'documents',
    'factures',
    'client',
    'conversation',
    'procedureInstance',
    'steps',
  ])('ne renvoie jamais %s au client', (field) => {
    expect(toClientDossierView(fullDossier())).not.toHaveProperty(field);
  });

  it('restreint aussi les relations imbriquées', () => {
    const view = toClientDossierView(fullDossier());
    expect(view.procedure_type).toEqual({ id: 3, name: 'Civile' });
    expect(view.jurisdiction).toEqual({ id: 2, name: 'TPI Douala' });
    expect(view.lawyer).toEqual({ full_name: 'Me Lionel' });
    expect(view.audiences).toEqual([
      {
        id: 7,
        audience_date: new Date('2026-03-12'),
        audience_time: '09:00',
        type: 0,
        status: 0,
        room: 'Salle 4',
      },
    ]);
  });

  it('garde ce que lisent les pages du portail', () => {
    expect(toClientDossierView(fullDossier())).toMatchObject({
      id: 91,
      dossier_number: 'DOS-91',
      object: 'Litige commercial',
      description: 'Résumé',
      status: 'LITIGATION',
      danger_level: 1,
      opening_date: new Date('2026-01-10'),
      closing_date: null,
      court_name: 'Chambre civile',
      case_number: 'RC/1/2026',
    });
  });

  it("lit les getters d'entité (nom de l'avocat) et tolère les relations absentes", () => {
    class Employee {
      user = { full_name: 'Me Marie' };
      get full_name() {
        return this.user.full_name;
      }
    }
    const view = toClientDossierView({
      id: 92,
      lawyer: new Employee(),
      procedure_type: null,
      jurisdiction: 'TPI Douala',
    });
    expect(view).toEqual({
      id: 92,
      lawyer: { full_name: 'Me Marie' },
      procedure_type: null,
      jurisdiction: 'TPI Douala',
    });
  });

  it("ne modifie pas l'original et laisse passer les valeurs vides", () => {
    const dossier = fullDossier();
    toClientDossierView(dossier);
    expect(dossier.documents).toHaveLength(1);
    expect(dossier.analysis_notes).toBe('interne:analysis_notes');
    expect(toClientDossierView(null)).toBeNull();
    expect(toClientDossierView(undefined)).toBeUndefined();
  });

  describe('DossiersController', () => {
    const service = {
      findOne: jest.fn(async () => fullDossier()),
      findAll: jest.fn(async () => [fullDossier(), fullDossier()]),
    };
    const controller = new DossiersController(
      service as any,
      {} as any,
      {} as any,
      {} as any,
    );

    it('GET /dossiers/:id : le client reçoit la projection', async () => {
      const body: any = await controller.findOne('91', CLIENT as any);
      expect(Object.keys(body).sort()).toEqual(CLIENT_FIELDS);
      expect(service.findOne).toHaveBeenCalledWith(91, CLIENT);
    });

    it('GET /dossiers : chaque dossier de la liste est projeté', async () => {
      const list = await controller.findAll({} as any, CLIENT as any);
      expect(list).toHaveLength(2);
      for (const dossier of list) {
        expect(Object.keys(dossier).sort()).toEqual(CLIENT_FIELDS);
      }
    });

    it.each(STAFF_ROLES)('le rôle %s voit toujours tout', async (role) => {
      const staff = { id: 48, role, tenantId: 25 };
      const one: any = await controller.findOne('91', staff as any);
      expect(one.analysis_notes).toBe('interne:analysis_notes');
      expect(one.budget_estimate).toBe('interne:budget_estimate');
      expect(one.documents).toHaveLength(1);
      expect(one.factures).toHaveLength(1);
      expect(one.collaborators).toHaveLength(1);

      const [first]: any[] = await controller.findAll({} as any, staff as any);
      expect(first.settlement_amount).toBe('interne:settlement_amount');
      expect(first.diligences).toHaveLength(1);
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

  it('administrateur : réponse inchangée (hors ai_config), mot de passe SMTP masqué', async () => {
    const body = await controller.get({
      user: { id: 48, role: 'admin', tenantId: 25 },
    } as any);
    expect(body).toMatchObject({
      smtp_config: { host: 'smtp.test', user: 'u', pass: '••••••••' },
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
