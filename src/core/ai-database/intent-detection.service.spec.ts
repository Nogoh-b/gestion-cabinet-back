import { describe, it, expect, jest } from '@jest/globals';
import { IntentDetectionService } from './intent-detection.service';

describe('IntentDetectionService local classifier', () => {
  const service = new IntentDetectionService({
    getAllHandlers: jest.fn(() => []),
    generateGlobalWriteSchema: jest.fn(async () => ''),
  } as any);

  it('detects help before write for dossier procedure questions', () => {
    expect(
      service.classifyLocal('je veux creer un dossier comment faire ?'),
    ).toBe('HELP');
  });

  it('detects help for client procedure questions', () => {
    expect(service.classifyLocal('comment creer un client ?')).toBe('HELP');
  });

  it('detects advice requests outside database search', () => {
    expect(
      service.classifyLocal("que peut tu me conseiller d'ajjouter encore ?"),
    ).toBe('ADVICE');
  });

  it('detects recommendation requests as advice', () => {
    expect(
      service.classifyLocal('quelles suggestions peux-tu me proposer ?'),
    ).toBe('ADVICE');
  });

  it('detects obvious write without LLM', () => {
    expect(service.classifyLocal('Crée un nouveau dossier pour Jean')).toBe(
      'WRITE',
    );
  });

  it('detects audience creation on a referenced dossier as write', () => {
    expect(
      service.classifyLocal(
        '#DOS1-202606-0001 ajoute une audience preliminaire pour le lundi 20 juillet a 15 h',
      ),
    ).toBe('WRITE');
  });

  it.each([
    "corrige les points d'attention",
    'Corrigez-les',
    "s'il te plait renomme les periodes",
    'répare les doublons selon tes recommandations',
  ])('traite « %s » comme une demande d’écriture, pas un conseil', (question) => {
    expect(service.classifyLocal(question)).toBe('WRITE');
  });

  it('ne confond pas une question sur les corrections avec une écriture', () => {
    // Pas à l'impératif en début de phrase : laissé au classifieur LLM.
    expect(
      service.classifyLocal('comment corriger une periode de paie ?'),
    ).not.toBe('WRITE');
    expect(
      service.classifyLocal('que me conseilles-tu de corriger ?'),
    ).toBe('ADVICE');
  });

  describe('demande corrective « corrige les points d’attention »', () => {
    const plan = JSON.stringify({
      type: 'WRITE',
      writePlan: {
        operations: [{ operation: 'UPDATE', entity: 'payroll_period', entityId: 7, fields: { label: 'Sept-Oct 2026' } }],
        humanReadable: 'Renommer la période',
        confidence: 0.7,
      },
    });
    const llmReturning = (...answers: string[]) => {
      let call = 0;
      const invoke = jest.fn(async () => ({
        content: answers[Math.min(call++, answers.length - 1)],
      }));
      return { invoke } as any;
    };

    it('redemande un plan quand le planner répond ADVICE, puis exige la confirmation', async () => {
      const planner = llmReturning('{"type":"ADVICE"}', plan);
      const result = await service.detectIntent(
        "corrige les point d'attenttions", llmReturning('READ'), '', { plannerLlm: planner },
      );
      expect(result.type).toBe('WRITE');
      expect(result.writePlan?.operations[0]).toMatchObject({ operation: 'UPDATE', entity: 'payroll_period' });
      expect(result.requiresConfirmation).toBe(true);
      expect(planner.invoke).toHaveBeenCalledTimes(2);
    });

    it('ne se rabat jamais sur un conseil : échec explicite si aucun plan n’est produit', async () => {
      const result = await service.detectIntent(
        "corrige les point d'attenttions", llmReturning('READ'), '', {
          plannerLlm: llmReturning('{"type":"ADVICE"}'),
        },
      );
      expect(result.type).toBe('WRITE');
      expect(result.writePlan).toBeUndefined();
      expect(result.writePlanError).toContain('WRITE');
    });
  });

  it('detects obvious read without LLM', () => {
    expect(service.classifyLocal('Liste les dossiers ouverts')).toBe('READ');
  });

  it('detects simple chat without LLM', () => {
    expect(service.classifyLocal('Bonjour')).toBe('CHAT');
  });

  it('retire les tables ignorées du schéma d’écriture', async () => {
    const generateGlobalWriteSchema = jest.fn(async () => 'schema');
    const scopedService = new IntentDetectionService(
      {
        getAllHandlers: jest.fn(() => []),
        generateGlobalWriteSchema,
      } as any,
      {
        databaseTablesConfig: {
          ignoredTables: ['procedure_instances', 'stages', 'sub_stage_visits'],
        },
      },
    );

    await (scopedService as any).getCachedWriteSchema();

    expect(generateGlobalWriteSchema).toHaveBeenCalledWith([
      'procedure_instances',
      'stages',
      'sub_stage_visits',
    ]);
  });
});
