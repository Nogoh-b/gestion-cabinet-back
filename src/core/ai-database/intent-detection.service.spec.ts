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

  it('« qu’est-ce qui » porte sur les données du cabinet, pas sur une définition', () => {
    // Mesuré par le banc : « Qu'est-ce qui est prêt à être facturé ? » partait
    // en conversation générale (« je n'ai pas accès aux données »).
    expect(service.classifyLocal("Qu'est-ce qui est prêt à être facturé ?")).not.toBe('CHAT');
    expect(service.classifyLocal("Qu'est-ce qui reste à payer ?")).not.toBe('CHAT');
    expect(service.classifyLocal("Qu'est-ce que la prescription en droit civil ?")).toBe('CHAT');
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

  describe('mode agent : messages et rédactions confiés au classifieur', () => {
    const skillCandidates = [
      { code: 'whatsapp', label: 'Message WhatsApp', description: 'Prépare un message au client' },
      { code: 'relancer_impayes', label: 'Relance des impayés', description: 'Prépare la relance des factures impayées' },
    ];
    const classifierSays = (answer: string) => ({ invoke: jest.fn(async () => ({ content: answer })) }) as any;

    it('« envoie un petit message… » : la compétence choisie par le classifieur, pas une écriture locale', async () => {
      const llm = classifierSays('SKILL:whatsapp');
      const result = await service.detectIntent(
        'Envoie un petit message au client du dossier DOS-7-0001 pour lui rappeler sa prochaine audience.',
        llm, '', { skillCandidates, maxSkillCandidates: 60, preferSkills: true },
      );
      expect(result).toMatchObject({ type: 'SKILL', skill: 'whatsapp' });
      expect(llm.invoke).toHaveBeenCalled();
    });

    it('« crée un client… » reste une écriture décidée localement', async () => {
      const llm = classifierSays('SKILL:whatsapp');
      const planner = classifierSays('{"type":"WRITE","operations":[]}');
      await service.detectIntent('Crée un client nommé Paul Test', llm, '', {
        skillCandidates, preferSkills: true, plannerLlm: planner,
      });
      // Décidé localement : le classifieur n'est pas consulté, le planificateur d'écriture l'est.
      expect(llm.invoke).not.toHaveBeenCalled();
      expect(planner.invoke).toHaveBeenCalled();
    });
  });

  it('detects obvious read without LLM', () => {
    expect(service.classifyLocal('Liste les dossiers ouverts')).toBe('READ');
  });

  it('detects simple chat without LLM', () => {
    expect(service.classifyLocal('Bonjour')).toBe('CHAT');
  });

  it('lit les données pour une synthèse de dossier, même avec « prochaines étapes »', () => {
    const domainService = new IntentDetectionService(
      {
        getAllHandlers: jest.fn(() => []),
        generateGlobalWriteSchema: jest.fn(async () => ''),
      } as any,
      { domainKeywords: ['dossier', 'client', 'facture'] } as any,
    );

    expect(
      domainService.classifyLocal(
        'Fais une synthèse du dossier CD-2026-002 : objet, parties, état de la procédure, dernières actions réalisées et prochaines étapes.',
      ),
    ).toBe('READ');
    expect(domainService.classifyLocal('Fais le point sur le client Ndi')).toBe(
      'READ',
    );
    // Sans enregistrement visé, « prochaines étapes » reste un conseil.
    expect(
      domainService.classifyLocal('quelles sont les prochaines étapes conseillées ?'),
    ).toBe('ADVICE');
    // Une fiche de synthèse à produire reste une écriture.
    expect(
      domainService.classifyLocal('rédige une fiche de synthèse du dossier'),
    ).toBe('WRITE');
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

describe('IntentDetectionService questions de droit (mode auto)', () => {
  const service = new IntentDetectionService({
    getAllHandlers: jest.fn(() => []),
    generateGlobalWriteSchema: jest.fn(async () => ''),
  } as any);

  it.each([
    "Quels sont les délais d'appel au Cameroun ?",
    "Qu'est-ce qu'un trouble de jouissance ?",
    'Quelle est la procédure pour contester un licenciement abusif ?',
    "Quelles sont les étapes d'une procédure de recouvrement OHADA ?",
    "Que dit l'article 1382 du code civil ?",
  ])('répond avec les connaissances du modèle : %s', (question) => {
    expect(service.classifyLocal(question)).toBe('CHAT');
  });

  it.each([
    'Quels sont les délais des audiences de mes dossiers ?',
    'Quelles sont les étapes du dossier DOS-2026-0039 ?',
    'Combien de dossiers en droit du travail sont en cours ?',
  ])('garde les données du cabinet : %s', (question) => {
    expect(service.classifyLocal(question)).not.toBe('CHAT');
  });

  it("garde l'aide à l'utilisation de l'application", () => {
    expect(service.classifyLocal('procédure pour créer une facture')).toBe('HELP');
  });
});

