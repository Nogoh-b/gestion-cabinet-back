import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ConversationManagerService } from './conversation-manager.service';
import { AiDatabaseService } from './ai-database.service';
import { IntentDetectionService } from './intent-detection.service';
import { selectFocusedDocuments } from './chat-attachments';

describe('Documents gardés avec la conversation', () => {
  const conversationRepo = {
    update: jest.fn(),
    findOne: jest.fn(async (): Promise<any> => ({ id: 'conv-1', userId: '7' })),
  };
  const messageRepo = {
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => ({ ...value, id: 41 })),
    find: jest.fn(async () => []),
  };
  const documentRepo = {
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => value),
    find: jest.fn(async (): Promise<any[]> => [{ id: 3, name: 'bail.pdf', content: 'Bail…' }]),
  };
  let manager: ConversationManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ConversationManagerService(conversationRepo as any, messageRepo as any, documentRepo as any);
  });

  it('enregistre le texte lu avec le message utilisateur, hors de ses métadonnées', async () => {
    const metadata = { filesInfo: [{ name: 'bail.pdf', size: 10, type: 'application/pdf' }] };
    await manager.withUserMessageMetadata(metadata, async () => {
      manager.queueUserMessageDocuments([{ name: 'bail.pdf', content: 'x'.repeat(500_000), method: 'text' }]);
      await manager.addUserMessage('conv-1', 'Lis ce bail');
    });

    const savedMessage: any = messageRepo.save.mock.calls[0][0];
    expect(JSON.stringify(savedMessage.metadata)).toBe(JSON.stringify(metadata));
    const [documents]: any = documentRepo.save.mock.calls[0];
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ conversationId: 'conv-1', messageId: 41, name: 'bail.pdf', method: 'text' });
    expect(documents[0].content).toHaveLength(400_000);
  });

  it("n'enregistre rien en conversation temporaire", async () => {
    await manager.runTemporary(() =>
      manager.withUserMessageMetadata({ filesInfo: [] }, async () => {
        manager.queueUserMessageDocuments([{ name: 'bail.pdf', content: 'Bail' }]);
        await manager.addUserMessage('conv-1', 'Lis ce bail');
        expect(await manager.getConversationDocuments('conv-1', '7')).toEqual([]);
      }),
    );
    expect(documentRepo.save).not.toHaveBeenCalled();
    expect(documentRepo.find).not.toHaveBeenCalled();
  });

  it("ne rend les documents qu'au propriétaire de la conversation", async () => {
    expect(await manager.getConversationDocuments('conv-1', '7')).toHaveLength(1);
    expect(await manager.getConversationDocuments('conv-1', '8')).toEqual([]);
    conversationRepo.findOne.mockResolvedValueOnce(null);
    expect(await manager.getConversationDocuments('conv-1', '7')).toEqual([]);
  });
});

describe('selectFocusedDocuments', () => {
  const docs = [
    { name: 'capture.png', content: 'Facture 118 — Société BINAOUA — montant 450 000 FCFA', batch: 9 },
    { name: 'annexe.pdf', content: 'Annexe au contrat de bail', batch: 9 },
    { name: 'bail-dupont.pdf', content: 'Contrat de bail — loyer mensuel 150 000 FCFA — préavis de trois mois', batch: 4 },
  ];

  it('prend le document nommé, même ancien', () => {
    expect(selectFocusedDocuments('que dit le bail-dupont ?', docs).map((d) => d.name)).toEqual(['bail-dupont.pdf']);
  });

  it('prend ceux dont la question reprend les mots', () => {
    expect(selectFocusedDocuments('quel est le loyer mensuel et le préavis ?', docs).map((d) => d.name)).toEqual([
      'bail-dupont.pdf',
    ]);
  });

  it('prend tous les documents pour une comparaison', () => {
    expect(selectFocusedDocuments('compare les deux images', docs)).toHaveLength(3);
  });

  it('sinon, ceux du dernier envoi', () => {
    expect(selectFocusedDocuments('li bien le contenu', docs).map((d) => d.name)).toEqual(['capture.png', 'annexe.pdf']);
  });
});

describe('Contexte de la requête avec les documents gardés', () => {
  function service(stored: any[]) {
    const instance: any = Object.create(AiDatabaseService.prototype);
    instance.MAX_FILE_CONTEXT_CHARS = 12000;
    instance.MAX_STORED_DOCUMENT_CHARS = 400_000;
    instance.intentDetectionService = new IntentDetectionService({} as any);
    instance.conversationManager = {
      queueUserMessageDocuments: jest.fn(),
      getConversationDocuments: jest.fn(async () => stored),
      getLastAssistantMetadata: jest.fn(async () => ({ documentAnswer: true })),
    };
    instance.resolveDocumentIdsByName = jest.fn(async () => []);
    return instance;
  }
  const longContract = [
    'CONTRAT DE BAIL COMMERCIAL entre la SCI Lumière et la société Dupont',
    ...Array.from({ length: 60 }, (_, i) => `Article ${i + 1}. Clause ordinaire numéro ${i + 1} sans objet particulier. `.repeat(12)),
    'Article 61. Clause résolutoire : à défaut de paiement d’un seul terme de loyer, le bail sera résilié de plein droit.',
    'Fait à Douala, signé par les parties.',
  ].join('\n\n');

  it("reprend le texte complet gardé par le serveur, sans l'aide du chat", async () => {
    const instance = service([
      { id: 5, name: 'bail.pdf', type: 'application/pdf', content: longContract, messageId: 40, method: 'text' },
    ]);
    const context = await instance.buildRequestContext(
      { question: 'que prévoit la clause résolutoire ?', conversationId: 'conv-1' },
      [],
      '7',
    );
    expect(instance.conversationManager.getConversationDocuments).toHaveBeenCalledWith('conv-1', '7');
    expect(context.documentContext).toHaveLength(1);
    expect(context.documentContext[0]).toMatchObject({ name: 'bail.pdf', reused: true, method: 'text' });
    // Passage de la fin d'un long document retrouvé, avec le début.
    expect(context.enrichedQuestion).toContain('Clause résolutoire');
    expect(context.enrichedQuestion).toContain('CONTRAT DE BAIL COMMERCIAL');
  });

  it("préfère la copie du serveur à celle, coupée, renvoyée par le chat", async () => {
    const instance = service([{ id: 5, name: 'bail.pdf', content: longContract, messageId: 40 }]);
    const context = await instance.buildRequestContext(
      {
        question: 'que prévoit la clause résolutoire ?',
        conversationId: 'conv-1',
        attachedDocuments: JSON.stringify([{ name: 'bail.pdf', content: longContract.slice(0, 20000), carried: true }]),
      },
      [],
      '7',
    );
    expect(context.documentContext).toHaveLength(1);
    expect(context.documentContext[0].content).toBe(longContract);
  });

  it('ne reprend pas les documents gardés pour une question sur les données du cabinet', async () => {
    const instance = service([{ id: 5, name: 'bail.pdf', content: longContract, messageId: 40 }]);
    const context = await instance.buildRequestContext(
      { question: 'combien de dossiers sont ouverts ?', conversationId: 'conv-1' },
      [],
      '7',
    );
    expect(context.documentContext).toEqual([]);
  });

  it('résume un long document avec des passages de tout le texte, fin comprise', () => {
    const instance = service([]);
    instance.extractSearchKeywords = () => [];
    const excerpt = instance.selectRelevantDocumentText('résume', longContract, 12000);
    expect(excerpt.length).toBeLessThanOrEqual(12000);
    expect(excerpt).toContain('CONTRAT DE BAIL COMMERCIAL');
    expect(excerpt).toContain('signé par les parties');
    // Des passages pris dans tout le document, pas seulement au début.
    expect(excerpt.split('[...]').length).toBeGreaterThan(5);
    expect(excerpt).not.toContain('Article 3. ');
  });
});
