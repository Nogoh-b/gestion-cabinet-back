import { EmployeeStatus } from 'src/modules/agencies/employee/entities/employee.entity';
import { ConversationType } from 'src/modules/chat/entities/conversation.entity';
import { DossierChatSyncService } from './dossier-chat-sync.service';

jest.mock('src/core/shared/services/socket/main.gateway', () => ({
  MainGateway: class {},
}));

function setup(options: {
  dossier: Record<string, any>;
  employees: Array<{ id: number; status?: EmployeeStatus }>;
  currentParticipantIds?: number[];
  conversation?: Record<string, any> | null;
  inTransaction?: boolean;
}) {
  const relation = {
    loadMany: jest.fn(async () =>
      (options.currentParticipantIds ?? []).map((id) => ({ id })),
    ),
    addAndRemove: jest.fn(async () => undefined),
  };
  const conversationRepo = {
    findOne: jest.fn(async () => options.conversation ?? null),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ ...v, id: 500 })),
    update: jest.fn(async () => undefined),
  };
  const updateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => undefined),
    relation: jest.fn(() => ({ of: jest.fn(() => relation) })),
  };
  const manager: any = {
    queryRunner: options.inTransaction
      ? { isTransactionActive: true }
      : undefined,
    findOne: jest.fn(async () => options.dossier),
    find: jest.fn(async () =>
      options.employees.map((e) => ({
        status: EmployeeStatus.ACTIVE,
        ...e,
      })),
    ),
    getRepository: jest.fn(() => conversationRepo),
    createQueryBuilder: jest.fn(() => updateQb),
  };
  const gateway = {
    emitConversationAdded: jest.fn(),
    emitConversationRemoved: jest.fn(),
    emitConversationUpdated: jest.fn(),
  };
  const chatService = {
    getConversationSummaryFor: jest.fn(async (userId, id) => ({
      id,
      participants: [],
    })),
  };
  const dispatcher = { dispatch: jest.fn(async () => undefined) };
  const dataSource: any = { subscribers: [], manager };
  const service = new DossierChatSyncService(
    dataSource,
    chatService as any,
    dispatcher as any,
    { get: jest.fn(() => gateway) } as any,
  );
  return {
    service,
    manager,
    relation,
    conversationRepo,
    gateway,
    dispatcher,
    dataSource,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('DossierChatSyncService', () => {
  it('membres = avocat + auteur + collaborateurs, sans doublon', () => {
    expect(
      DossierChatSyncService.expectedMemberIds({
        lawyer_id: 1,
        created_by_id: 2,
        collaborators: [{ id: 3 }, { id: 1 }] as any,
      }),
    ).toEqual([1, 2, 3]);
  });

  it('ajoute les nouveaux membres et retire ceux qui ne le sont plus', async () => {
    const { service, manager, relation, gateway, dispatcher } = setup({
      dossier: {
        id: 7,
        dossier_number: 'D-007',
        lawyer_id: 1,
        created_by_id: 2,
        collaborators: [{ id: 3 }],
        conversation_id: 10,
      },
      employees: [{ id: 1 }, { id: 2 }, { id: 3 }],
      currentParticipantIds: [1, 4],
      conversation: { id: 10, type: ConversationType.DOSSIER },
    });

    const result = await service.sync(7, manager);
    await flush();

    expect(relation.addAndRemove).toHaveBeenCalledWith([2, 3], [4]);
    expect(result).toMatchObject({ added: [2, 3], removed: [4] });
    expect(gateway.emitConversationAdded).toHaveBeenCalledTimes(2);
    expect(gateway.emitConversationRemoved).toHaveBeenCalledWith(
      4,
      10,
      expect.stringContaining('D-007'),
    );
    expect(gateway.emitConversationUpdated).toHaveBeenCalledWith(
      [1],
      10,
      expect.anything(),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'collaborator_added',
        audience: expect.objectContaining({ collaborator_ids: [2, 3] }),
      }),
    );
    // Le membre retiré est prévenu, sans copie aux administrateurs.
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'collaborator_removed',
        title: expect.stringContaining('retiré du dossier D-007'),
        audience: expect.objectContaining({
          collaborator_ids: [4],
          admin_ids_override: [],
        }),
      }),
    );
  });

  it("n'inclut pas un employé inactif", async () => {
    const { service, manager, relation } = setup({
      dossier: {
        id: 7,
        dossier_number: 'D-007',
        lawyer_id: 1,
        collaborators: [{ id: 3 }],
        conversation_id: 10,
      },
      employees: [{ id: 1 }, { id: 3, status: EmployeeStatus.INACTIVE }],
      currentParticipantIds: [1, 3],
      conversation: { id: 10, type: ConversationType.DOSSIER },
    });

    await service.sync(7, manager);
    expect(relation.addAndRemove).toHaveBeenCalledWith([], [3]);
  });

  it('crée le chat manquant avec les membres du dossier', async () => {
    const { service, manager, conversationRepo, dispatcher } = setup({
      dossier: {
        id: 7,
        dossier_number: 'D-007',
        lawyer_id: 1,
        created_by_id: 2,
        collaborators: [],
        conversation_id: null,
        tenant_id: 3,
      },
      employees: [{ id: 1 }, { id: 2 }],
    });

    const result = await service.sync(7, manager);
    await flush();

    expect(conversationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Dossier D-007',
        type: ConversationType.DOSSIER,
        tenant_id: 3,
      }),
    );
    expect(result).toMatchObject({ conversationId: 500, created: true });
    // La création est déjà notifiée par « dossier créé ».
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('attend la validation de la transaction pour diffuser', async () => {
    const { service, manager, gateway } = setup({
      dossier: {
        id: 7,
        dossier_number: 'D-007',
        lawyer_id: 1,
        collaborators: [],
        conversation_id: 10,
      },
      employees: [{ id: 1 }],
      currentParticipantIds: [],
      conversation: { id: 10, type: ConversationType.DOSSIER },
      inTransaction: true,
    });

    await service.sync(7, manager);
    await flush();
    expect(gateway.emitConversationAdded).not.toHaveBeenCalled();

    service.afterTransactionCommit({ queryRunner: manager.queryRunner } as any);
    await flush();
    expect(gateway.emitConversationAdded).toHaveBeenCalledWith(
      1,
      expect.anything(),
    );
  });

  it("n'émet rien si la transaction est annulée", async () => {
    const { service, manager, gateway } = setup({
      dossier: {
        id: 7,
        dossier_number: 'D-007',
        lawyer_id: 1,
        collaborators: [],
        conversation_id: 10,
      },
      employees: [{ id: 1 }],
      currentParticipantIds: [],
      conversation: { id: 10, type: ConversationType.DOSSIER },
      inTransaction: true,
    });

    await service.sync(7, manager);
    service.afterTransactionRollback({
      queryRunner: manager.queryRunner,
    } as any);
    service.afterTransactionCommit({ queryRunner: manager.queryRunner } as any);
    await flush();
    expect(gateway.emitConversationAdded).not.toHaveBeenCalled();
  });
});
