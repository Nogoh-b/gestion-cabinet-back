import { AiDatabaseController } from './ai-database.controller';

describe('AiDatabaseController - mode demandé', () => {
  const aiDbService = {
    analyzeQuestion: jest.fn(),
  };

  const controller = new AiDatabaseController(
    aiDbService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('garde le mode choisi et n’exécute jamais le SQL directement', async () => {
    aiDbService.analyzeQuestion.mockResolvedValue({
      success: true,
      analysis: 'résultat',
    });
    const dto = {
      question: 'Discutons du dossier',
      intentMode: 'chat',
      analyzeOnly: false,
    } as any;
    const request = { user: { id: 42 }, aiRequestLogId: 'log-1' };

    await controller.analyze(dto, request);

    expect(dto.intentMode).toBe('chat');
    expect(dto.analyzeOnly).toBe(true);
    expect(aiDbService.analyzeQuestion).toHaveBeenCalledWith(dto, 42, undefined, 'log-1');
  });
});
