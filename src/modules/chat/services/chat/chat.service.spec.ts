import { NotFoundException } from '@nestjs/common';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { ChatService } from './chat.service';

describe('ChatService security boundaries', () => {
  const buildService = (overrides: Record<string, any> = {}) => {
    const conversationRepository = {
      findOne: jest.fn(),
      ...overrides.conversationRepository,
    };
    const messageReadRepository = {
      ...overrides.messageReadRepository,
    };
    const messageRepository = {
      ...overrides.messageRepository,
    };
    const userService = {
      findOne: jest.fn(),
      ...overrides.userService,
    };
    const userRepository = {
      ...overrides.userRepository,
    };
    const attachmentRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      ...overrides.attachmentRepository,
    };
    const attachmentStorage = {
      read: jest.fn(),
      ...overrides.attachmentStorage,
    };
    const dataSource = {
      transaction: jest.fn(),
      ...overrides.dataSource,
    };
    const auditService = {
      append: jest.fn(),
      ...overrides.auditService,
    };
    const service = new ChatService(
      conversationRepository as any,
      messageReadRepository as any,
      messageRepository as any,
      userService as any,
      userRepository as any,
      attachmentRepository as any,
      attachmentStorage as any,
      dataSource as any,
      auditService as any,
    );
    return {
      service,
      conversationRepository,
      userService,
      attachmentRepository,
      attachmentStorage,
      dataSource,
      auditService,
    };
  };

  it('masque une conversation à un utilisateur qui n’en est pas membre', async () => {
    const { service, conversationRepository, userService } = buildService({
      conversationRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          tenant_id: 42,
          participants: [{ id: 2 }],
        }),
      },
    });

    await expect(
      runWithTenantContext(42, () =>
        service.sendMessage({ conversationId: 7, content: 'x' } as any, 9),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(userService.findOne).not.toHaveBeenCalled();
    expect(conversationRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, tenant_id: 42 },
      }),
    );
  });

  it('refuse un pré-téléversement appartenant à un autre auteur', async () => {
    const { service, attachmentRepository } = buildService({
      conversationRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          tenant_id: 42,
          participants: [{ id: 9 }],
        }),
      },
      userService: {
        findOne: jest.fn().mockResolvedValue({ id: 9, user: {} }),
      },
      attachmentRepository: {
        find: jest.fn().mockResolvedValue([]),
      },
    });

    await expect(
      runWithTenantContext(42, () =>
        service.sendMessageWithExistingAttachments(
          {
            conversationId: 7,
            content: '',
            attachmentIds: [123],
          } as any,
          9,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(attachmentRepository.find).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: expect.anything(),
        tenant_id: 42,
        conversationId: 7,
        uploadedById: 9,
        message: expect.anything(),
      }),
    });
  });

  it('ne lit jamais le fichier avant d’avoir validé l’appartenance à la conversation', async () => {
    const { service, attachmentStorage, dataSource, auditService } = buildService({
      attachmentRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 123,
          tenant_id: 42,
          conversationId: 7,
          storageKey: 'tenants/42/chat/private.pdf',
          sha256: '0'.repeat(64),
          securityStatus: 'CLEAN',
        }),
      },
      conversationRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          tenant_id: 42,
          participants: [{ id: 2 }],
        }),
      },
    });

    await expect(
      runWithTenantContext(42, () => service.downloadAttachment(123, 9)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(attachmentStorage.read).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(auditService.append).not.toHaveBeenCalled();
  });

  it('annule le message si une pièce jointe a déjà été consommée concurremment', async () => {
    const claimBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const transactionalMessageRepository = {
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async value => ({ ...value, id: 88 })),
    };
    const transactionalAttachmentRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(claimBuilder),
    };
    const manager = {
      getRepository: jest.fn((entity: any) => {
        if (entity.name === 'Message') return transactionalMessageRepository;
        if (entity.name === 'Attachment') {
          return transactionalAttachmentRepository;
        }
        return {};
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (action: any) => action(manager)),
    };
    const { service } = buildService({
      conversationRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          tenant_id: 42,
          participants: [{ id: 9 }],
        }),
      },
      userService: {
        findOne: jest.fn().mockResolvedValue({ id: 9, user: {} }),
      },
      attachmentRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 123,
            tenant_id: 42,
            conversationId: 7,
            uploadedById: 9,
            mimeType: 'application/pdf',
          },
        ]),
      },
      dataSource,
    });

    await expect(
      runWithTenantContext(42, () =>
        service.sendMessageWithExistingAttachments(
          {
            conversationId: 7,
            content: '',
            attachmentIds: [123],
          } as any,
          9,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(claimBuilder.execute).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
