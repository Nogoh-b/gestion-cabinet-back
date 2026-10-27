import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';

function buildService() {
  const conversationRepository = { update: jest.fn(async () => undefined) };
  const messageReadRepository = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    update: jest.fn(async () => undefined),
  };
  const messageRepository = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ ...v, id: 77 })),
  };
  const userService = {
    findOne: jest.fn(async (id: number) => ({
      id,
      user: { full_name: 'Maître Test' },
    })),
  };
  const attachmentRepository = {
    find: jest.fn(async () => [] as any[]),
    update: jest.fn(async () => undefined),
  };
  const service = new ChatService(
    conversationRepository as any,
    messageReadRepository as any,
    messageRepository as any,
    userService as any,
    {} as any,
    attachmentRepository as any,
  );
  jest.spyOn(service, 'isParticipant').mockResolvedValue(true);
  jest.spyOn(service, 'getParticipantIds').mockResolvedValue([1, 2]);
  jest
    .spyOn(service, 'getMessagePayload')
    .mockImplementation(async (id) => ({ id }) as any);
  return {
    service,
    conversationRepository,
    messageReadRepository,
    attachmentRepository,
  };
}

describe('ChatService : envoi', () => {
  it("refuse l'envoi à une conversation dont on n'est pas membre", async () => {
    const { service } = buildService();
    jest.spyOn(service, 'isParticipant').mockResolvedValue(false);
    await expect(
      service.sendMessageWithExistingAttachments(
        { conversationId: 5, content: 'Bonjour' },
        1,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un message vide', async () => {
    const { service } = buildService();
    await expect(
      service.sendMessageWithExistingAttachments(
        { conversationId: 5, content: '   ' },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse la pièce jointe téléversée par quelqu'un d'autre", async () => {
    const { service, attachmentRepository } = buildService();
    attachmentRepository.find.mockResolvedValue([
      { id: 9, uploadedById: 42, message: null },
    ]);
    await expect(
      service.sendMessageWithExistingAttachments(
        { conversationId: 5, attachmentIds: [9] },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte un message composé uniquement de pièces jointes', async () => {
    const { service, attachmentRepository, conversationRepository, messageReadRepository } =
      buildService();
    attachmentRepository.find.mockResolvedValue([
      { id: 9, uploadedById: 1, message: null, mimeType: 'application/pdf' },
    ]);

    const payload = await service.sendMessageWithExistingAttachments(
      { conversationId: 5, attachmentIds: [9], clientTempId: 'tmp-1' },
      1,
    );

    expect(payload).toMatchObject({ id: 77, clientTempId: 'tmp-1' });
    expect(attachmentRepository.update).toHaveBeenCalled();
    // Une ligne d'accusé par participant, l'expéditeur a déjà lu.
    expect(messageReadRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ reader: { id: 1 }, isRead: true }),
      expect.objectContaining({ reader: { id: 2 }, isRead: false }),
    ]);
    expect(conversationRepository.update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        lastMessageData: expect.objectContaining({
          content: '📎 Pièce jointe',
          status: 'sent',
          messageId: 77,
        }),
      }),
    );
  });
});

describe('ChatService : accusés de lecture', () => {
  it('ne marque que les lignes du lecteur et renvoie les messages lus', async () => {
    const { service, messageReadRepository } = buildService();
    jest.spyOn(service as any, 'pendingReceipts').mockResolvedValue([
      { readId: 11, messageId: 101, conversationId: 5 },
      { readId: 12, messageId: 102, conversationId: 5 },
    ]);
    jest
      .spyOn(service as any, 'refreshLastMessageStatus')
      .mockResolvedValue(undefined);

    const update = await service.markMessagesAsRead(5, 2);

    expect((service as any).pendingReceipts).toHaveBeenCalledWith(
      2,
      'isRead',
      5,
    );
    expect(messageReadRepository.update).toHaveBeenCalledWith(
      { id: expect.anything() },
      expect.objectContaining({ isRead: true, isReceive: true }),
    );
    expect(update).toMatchObject({ conversationId: 5, messageIds: [101, 102] });
  });

  it('ne fait rien quand tout est déjà lu', async () => {
    const { service, messageReadRepository } = buildService();
    jest.spyOn(service as any, 'pendingReceipts').mockResolvedValue([]);
    expect(await service.markMessagesAsRead(5, 2)).toBeNull();
    expect(messageReadRepository.update).not.toHaveBeenCalled();
  });
});
