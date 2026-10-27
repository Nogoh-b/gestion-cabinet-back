import { ConversationManagerService } from './conversation-manager.service';

describe('Conversations temporaires', () => {
  const conversationRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    update: jest.fn(),
    findOne: jest.fn(),
  };
  const messageRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), count: jest.fn() };
  let manager: ConversationManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ConversationManagerService(conversationRepo as any, messageRepo as any);
  });

  it('ne crée aucune conversation ni aucun message en base, y compris avec un identifiant existant', async () => {
    await manager.runTemporary(async () => {
      const conversation = await manager.createConversation('user-1');
      await manager.addUserMessage(conversation.id, 'Résume ce client');
      await manager.addAssistantMessage(conversation.id, 'Synthèse');
      await manager.addSystemMessage(conversation.id, 'Contexte');
      await manager.initializeSystemContext(conversation.id, 'Schéma');
      await manager.updateConversationTitle(conversation.id, 'Question');
      expect(await manager.getConversation(conversation.id)).toBe(conversation);
      expect(await manager.getRecentHistoryForPrompt('saved-id')).toEqual([]);
      expect(await manager.getStructuredFollowUpContext('saved-id')).toBeNull();
      expect(await manager.hasSystemMessage('saved-id')).toBe(false);
    });
    for (const mock of Object.values(conversationRepo)) expect(mock).not.toHaveBeenCalled();
    for (const mock of Object.values(messageRepo)) expect(mock).not.toHaveBeenCalled();
  });

  it('isole les requêtes simultanées et garde la sauvegarde des conversations habituelles', async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const temporary = manager.runTemporary(async () => {
      const conversation = await manager.createConversation('temporary-user');
      await wait;
      await manager.addUserMessage(conversation.id, 'Question');
      return conversation;
    });
    const saved = await manager.createConversation('saved-user');
    release();
    const ephemeral = await temporary;
    expect(ephemeral.id).not.toBe(saved.id);
    expect(conversationRepo.save).toHaveBeenCalledTimes(1);
    expect(conversationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'saved-user' }));
    expect(messageRepo.save).not.toHaveBeenCalled();
    await manager.createConversation('another-user');
    expect(conversationRepo.save).toHaveBeenCalledTimes(2);
  });
});
