import { AiDatabaseController } from './ai-database.controller';

describe('AiDatabaseController - lecture seule', () => {
  const aiDbService = {
    analyzeQuestion: jest.fn(),
  };

  const controller = new AiDatabaseController(
    aiDbService as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("force une demande d'écriture en analyse sans mutation", async () => {
    aiDbService.analyzeQuestion.mockResolvedValue({
      success: true,
      analysis: 'résultat',
    });
    const dto = {
      question: 'Crée un dossier',
      intentMode: 'write',
      analyzeOnly: false,
    } as any;
    const user = { id: 42, tenantId: 7 };
    const request = { aiRequestLogId: 'log-1' };

    await controller.askQuestion(dto, user, request);

    expect(dto.intentMode).toBe('read');
    expect(dto.analyzeOnly).toBe(true);
    expect(aiDbService.analyzeQuestion).toHaveBeenCalledWith(
      dto,
      user,
      undefined,
      'log-1',
    );
  });
});
