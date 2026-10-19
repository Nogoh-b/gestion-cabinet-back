import { AiDatabaseService } from './ai-database.service';
import { IntentDetectionService } from './intent-detection.service';

const pdf = {
  originalname: 'customer_due_diligence_questionnaire.pdf',
  mimetype: 'application/pdf',
  size: 1200,
} as Express.Multer.File;
// « recommandations » suffirait à classer la demande en ADVICE si le texte du PDF était lu.
const documentText =
  'Customer due diligence questionnaire. Nos recommandations : désigner un responsable conformité. '.repeat(3);
const dossier = {
  type: 'dossier',
  label: '#DOS-2026-0038 — Émilie LEFÈVRE',
  data: { id: 90 },
};
const writePlan = (...entities: string[]) => ({
  type: 'WRITE',
  requiresConfirmation: false,
  writePlan: {
    transaction: true,
    humanReadable: 'Plan proposé',
    confidence: 0.95,
    operations: entities.map((entity, index) => ({
      operation: 'INSERT',
      entity,
      fields: { dossier_id: 90 },
      tempId: `op_${index}`,
      humanReadable: '',
    })),
  },
});

function buildService(question: string, intent: any = { type: 'READ' }) {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  service.configureRequestModel = () => ({ mode: 'fast' });
  service.getRequestModelName = () => 'test';
  service.getRequestModel = () => ({});
  service.sleep = async () => undefined;
  service.markMetric = jest.fn();
  service.computeSourceSignals = jest.fn(async () => undefined);
  service.tryConsumePendingEntityIdClarification = () => null;
  service.buildRequestContext = async () => ({
    enrichedQuestion: `${question}\n--- DOCUMENTS A ANALYSER ---\n${documentText}`,
    intentQuestion: question,
    documentContext: [{ name: pdf.originalname, source: 'upload', content: documentText, truncated: false }],
    referenced: [dossier],
    fileInfo: { name: pdf.originalname },
  });
  service.detectRelevantTables = async () => ['dossiers', 'audiences'];
  service.getCompleteSchema = async () => 'schema';
  service.getHistorySnippetForIntent = async () => '';
  service.lastDisplayedRecords = new Map();
  service.aiPermissionService = {
    assertCanReadTables: jest.fn(),
    assertCanWritePlan: jest.fn(),
    partitionReadableTables: jest.fn(async (_user, tables: string[]) => ({ allowed: tables, denied: [] })),
    getHiddenColumns: jest.fn(async () => new Map()),
    redactRows: jest.fn(async (_user, _sql, rows) => rows),
  };
  service.conversationManager = {
    createConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    addUserMessage: jest.fn(),
    addAssistantMessage: jest.fn(),
  };
  service.analyzeDocumentsStream = jest.fn().mockResolvedValue('Analyse du document');
  service.handleAdviceIntentStream = jest.fn();
  service.executeWritePlanStream = jest.fn();
  service.formatPlanForDisplay = () => 'plan';
  service.intentDetectionService = new IntentDetectionService({} as any);
  jest.spyOn(service.intentDetectionService, 'detectIntent').mockResolvedValue(intent);
  return service;
}

async function ask(service: any, question: string) {
  const events: Array<[string, any]> = [];
  await service.analyzeQuestionStreamInternal({ question }, { id: 1 }, pdf, (event: string, data: any) => events.push([event, data]));
  expect(events.filter(([event]) => event === 'error')).toEqual([]);
  return events;
}

describe('Pièce jointe + demande d’écriture (chat en streaming)', () => {
  it('une action appuyée sur le document part au planner, pas en analyse', async () => {
    const question = 'crée une audience pour le dossier DOS-2026-0038 à partir de ce document';
    const service = buildService(question, { ...writePlan('audiences'), requiresConfirmation: true });
    const events = await ask(service, question);

    expect(service.intentDetectionService.detectIntent).toHaveBeenCalledWith(
      expect.stringContaining(documentText.trim()),
      expect.anything(),
      'schema',
      expect.objectContaining({ forceWrite: true }),
    );
    // Le planner sait qu'un fichier est joint et comment exprimer son classement.
    expect(service.intentDetectionService.detectIntent.mock.calls[0][0]).toContain(`« ${pdf.originalname} »`);
    expect(service.handleAdviceIntentStream).not.toHaveBeenCalled();
    expect(service.analyzeDocumentsStream).not.toHaveBeenCalled();
    const confirmation = events.find(([event]) => event === 'confirmation')?.[1];
    expect(confirmation.plan.operations).toHaveLength(1);
    expect(confirmation.documentsExcluded).toBeUndefined();
  });

  it('une lecture du document reste une analyse directe, avec le dossier en contexte', async () => {
    const question = 'résume ce document';
    const service = buildService(question);
    await ask(service, question);

    expect(service.intentDetectionService.detectIntent).not.toHaveBeenCalled();
    // 5e argument : passage cité (aucun ici).
    expect(service.analyzeDocumentsStream).toHaveBeenCalledWith(
      question,
      expect.any(Array),
      expect.any(Function),
      [dossier],
      undefined,
      expect.objectContaining({ allowOutsideDocument: false }),
    );
  });

  it('retombe sur l’analyse du document quand le planner ne retient aucune écriture', async () => {
    const question = 'que change ce document pour le dossier ?';
    const service = buildService(question, { type: 'READ' });
    await ask(service, question);

    expect(service.intentDetectionService.detectIntent).toHaveBeenCalled();
    expect(service.analyzeDocumentsStream).toHaveBeenCalled();
  });

  it('classer le fichier ouvre le formulaire d’ajout au lieu d’un plan sans fichier', async () => {
    const question = 'ajoute ce document au dossier DOS-2026-0038';
    const service = buildService(question, writePlan('document_customer'));
    const events = await ask(service, question);

    const upload = events.find(([event]) => event === 'document_upload')?.[1];
    expect(upload).toEqual({ message: expect.stringContaining(pdf.originalname), conversationId: 'conv-1' });
    expect(events.some(([event]) => event === 'confirmation')).toBe(false);
    expect(service.aiPermissionService.assertCanWritePlan).not.toHaveBeenCalled();
    expect(service.executeWritePlanStream).not.toHaveBeenCalled();
  });

  it('garde les autres opérations et demande confirmation en signalant le fichier écarté', async () => {
    const question = 'crée une audience et ajoute ce document au dossier';
    const service = buildService(question, writePlan('audiences', 'document_customer'));
    const events = await ask(service, question);

    const confirmation = events.find(([event]) => event === 'confirmation')?.[1];
    expect(confirmation.plan.operations.map((op: any) => op.entity)).toEqual(['audiences']);
    expect(confirmation.plan.humanReadable).toContain(pdf.originalname);
    expect(confirmation.documentsExcluded).toBe(true);
    expect(service.executeWritePlanStream).not.toHaveBeenCalled();
  });
});

describe('Prompt d’analyse de document', () => {
  it('situe la demande avec les entités référencées sans en faire un motif de refus', () => {
    const service: any = Object.create(AiDatabaseService.prototype);
    const docs = [{ name: pdf.originalname, source: 'upload', content: documentText, truncated: false }];
    const prompt = service.buildDocumentAnalysisPrompt('résume ce document', docs, [dossier]);
    expect(prompt).toContain('#DOS-2026-0038 — Émilie LEFÈVRE');
    expect(prompt).toContain('ce n\'est jamais un motif de refus');
    expect(prompt).toContain('n\'affirme jamais avoir créé, ajouté, classé');
    expect(service.buildDocumentAnalysisPrompt('résume ce document', docs)).not.toContain('CONTEXTE CHOISI');
  });
});

describe('Document repris après plusieurs messages', () => {
  const carried = {
    name: 'fiche.jpg',
    source: 'upload',
    content: 'Cabinet Francis EBIANG — Email : contact@cfe.cm — Affaire OVAMBE',
    truncated: false,
    reused: true,
  };

  function buildFollowUpService(question: string, focus: string) {
    const service = buildService(question, { type: 'CONVERSATIONAL' });
    service.buildRequestContext = async () => ({
      enrichedQuestion: `${question}\n--- DOCUMENTS A ANALYSER ---\n${carried.content}`,
      intentQuestion: question,
      documentContext: [{ ...carried }],
      referenced: [],
      documentFocus: focus,
    });
    service.conversationManager.getRecentHistoryForPrompt = jest.fn(async () => [
      { role: 'user', content: 'Lis cette image' },
      { role: 'assistant', content: 'Fiche du cabinet Francis EBIANG…' },
    ]);
    service.generateConversationalResponseStream = jest.fn(async () => 'Bonjour');
    return service;
  }

  async function askInConversation(service: any, question: string) {
    const events: Array<[string, any]> = [];
    await service.analyzeQuestionStreamInternal(
      { question, conversationId: 'conv-1' },
      { id: 1 },
      undefined,
      (event: string, data: any) => events.push([event, data]),
    );
    expect(events.filter(([event]) => event === 'error')).toEqual([]);
    return events;
  }

  it("répond à partir du document avec l'historique et marque la réponse", async () => {
    const question = "l'adresse mail du cabinet c'est quoi ?";
    const service = buildFollowUpService(question, 'content');
    await askInConversation(service, question);

    const options = service.analyzeDocumentsStream.mock.calls[0][5];
    expect(options.allowOutsideDocument).toBe(true);
    expect(options.history.map((message: any) => message.content)).toEqual([
      'Lis cette image',
      'Fiche du cabinet Francis EBIANG…',
    ]);
    expect(service.conversationManager.addAssistantMessage).toHaveBeenCalledWith(
      'conv-1',
      'Analyse du document',
      undefined,
      { documentAnswer: true },
    );
    expect(service.intentDetectionService.detectIntent).not.toHaveBeenCalled();
  });

  it('cherche ailleurs, sans le texte du document, quand il ne traite pas de la question', async () => {
    const question = 'bonjour, ça va ?';
    const service = buildFollowUpService(question, 'previous');
    service.analyzeDocumentsStream = jest.fn().mockResolvedValue(null);
    const events = await askInConversation(service, question);

    expect(service.intentDetectionService.detectIntent).toHaveBeenCalled();
    expect(service.intentDetectionService.detectIntent.mock.calls[0][0]).not.toContain('contact@cfe.cm');
    expect(
      events.some(([event, data]) => event === 'status' && /ne traite pas/.test(data.message)),
    ).toBe(true);
    expect(service.generateConversationalResponseStream).toHaveBeenCalled();
    // Aucune réponse « document » enregistrée.
    expect(service.conversationManager.addAssistantMessage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      { documentAnswer: true },
    );
  });

  it('ne laisse pas le modèle écarter un document désigné par la question', async () => {
    const question = 'résume ce document';
    const service = buildFollowUpService(question, 'explicit');
    await askInConversation(service, question);
    expect(service.analyzeDocumentsStream.mock.calls[0][5].allowOutsideDocument).toBe(false);
  });
});

describe('Réponse « hors document » en streaming', () => {
  function streamingService(chunks: string[]) {
    const service: any = Object.create(AiDatabaseService.prototype);
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    service.recordOutput = jest.fn();
    service.streamModel = jest.fn(async () =>
      (async function* () {
        for (const content of chunks) yield { content };
      })(),
    );
    return service;
  }
  const docs = [{ name: 'fiche.jpg', source: 'upload', content: 'Cabinet Francis EBIANG', truncated: false }];

  it('renvoie null sans rien afficher ni enregistrer', async () => {
    const service = streamingService(['[HORS_', 'DOCUMENT]']);
    const events: any[] = [];
    const onCommit = jest.fn(async () => undefined);
    const result = await service.analyzeDocumentsStream(
      'bonjour',
      docs,
      (...event: any[]) => events.push(event),
      [],
      undefined,
      { allowOutsideDocument: true, onCommit },
    );
    expect(result).toBeNull();
    expect(events).toEqual([]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('affiche la réponse une fois tranchée, après avoir enregistré la question', async () => {
    const service = streamingService(['L’adresse', ' e-mail est ', 'contact@cfe.cm.']);
    const order: string[] = [];
    const result = await service.analyzeDocumentsStream(
      "l'adresse mail ?",
      docs,
      (event: string, data: any) => order.push(`${event}:${data.text}`),
      [],
      undefined,
      {
        allowOutsideDocument: true,
        onCommit: async () => {
          order.push('commit');
        },
      },
    );
    expect(result).toBe('L’adresse e-mail est contact@cfe.cm.');
    expect(order[0]).toBe('commit');
    expect(order.slice(1).join('')).toBe('token:L’adresse e-mail est token:contact@cfe.cm.');
  });

  it("met l'historique et la consigne hors document dans le prompt", () => {
    const service: any = Object.create(AiDatabaseService.prototype);
    const prompt = service.buildDocumentAnalysisPrompt("et l'autre partie ?", docs, [], undefined, {
      history: [
        { role: 'user', content: 'Lis cette image' },
        { role: 'assistant', content: 'Partie : OVAMBE NDONO' },
      ],
      allowOutsideDocument: true,
    });
    expect(prompt).toContain('## CONVERSATION RÉCENTE');
    expect(prompt).toContain('Assistant : Partie : OVAMBE NDONO');
    expect(prompt).toContain('[HORS_DOCUMENT]');
    expect(service.buildDocumentAnalysisPrompt('résume', docs)).not.toContain('HORS_DOCUMENT');
  });
});
