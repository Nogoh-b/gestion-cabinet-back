import { describe, it, expect, jest } from '@jest/globals';
import { IntentDetectionService } from './intent-detection.service';
import { LegalKnowledgeMatch } from './legal-knowledge';
import {
  SourceSignals,
  answerSources,
  extractRecordReference,
  isDecisiveKnowledgeRoute,
  isKnowledgeQuestion,
  summarizeLegalMatches,
} from './source-signals';

const match = (coverage: number, matched_terms = 3): LegalKnowledgeMatch => ({
  document_id: 'doc-1',
  document_name: 'AUPSRVE.pdf',
  chunk: 'Article 28 — À défaut d’exécution volontaire…',
  score: coverage * 10 + matched_terms,
  coverage,
  matched_terms,
});

const signals = (patch: Partial<SourceSignals> = {}): SourceSignals => ({
  recordReference: null,
  cabinetAnchor: false,
  followUp: false,
  domainKeyword: false,
  legalMarkers: false,
  writeVerb: false,
  legalKb: null,
  ...patch,
});

describe('source-signals', () => {
  it.each([
    ['Synthèse du dossier DOS-2026-0039', 'DOS-2026-0039'],
    ['la facture FAC/2026/12 est-elle payée ?', 'FAC/2026/12'],
    ["que dit l'article L-121 du code ?", null],
    ['la loi n°2016/007 portant code pénal', null],
    ["délais d'appel en matière civile", null],
  ])('repère un numéro métier : %s', (question, expected) => {
    expect(extractRecordReference(question)).toBe(expected);
  });

  it('résume la base juridique par son meilleur extrait', () => {
    expect(summarizeLegalMatches([match(0.4), match(0.8)])).toEqual({
      coverage: 0.8,
      matchedTerms: 3,
      documents: ['AUPSRVE.pdf'],
    });
    expect(summarizeLegalMatches([])).toBeNull();
  });

  it('ne tranche sans classifieur que sur une base forte et sans vocabulaire métier', () => {
    const strong = {
      coverage: 0.8,
      matchedTerms: 3,
      documents: ['AUPSRVE.pdf'],
    };
    expect(isDecisiveKnowledgeRoute(signals({ legalKb: strong }))).toBe(true);
    // « clients débiteurs » : la base juridique en parle, mais c'est peut-être une liste.
    expect(
      isDecisiveKnowledgeRoute(
        signals({ legalKb: strong, domainKeyword: true }),
      ),
    ).toBe(false);
    expect(
      isDecisiveKnowledgeRoute(
        signals({ legalKb: strong, domainKeyword: true, legalMarkers: true }),
      ),
    ).toBe(true);
    expect(
      isDecisiveKnowledgeRoute(
        signals({ legalKb: strong, cabinetAnchor: true }),
      ),
    ).toBe(false);
    expect(
      isDecisiveKnowledgeRoute(
        signals({ legalKb: { ...strong, matchedTerms: 1 } }),
      ),
    ).toBe(false);
  });

  it('exige un indice positif de connaissance pour remplacer une lecture vide', () => {
    expect(isKnowledgeQuestion(signals({ legalMarkers: true }))).toBe(true);
    // Une lecture vide sans formulation juridique reste « rien trouvé ».
    expect(isKnowledgeQuestion(signals())).toBe(false);
    expect(
      isKnowledgeQuestion(
        signals({ legalMarkers: true, recordReference: 'DOS-2026-1' }),
      ),
    ).toBe(false);
    expect(
      isKnowledgeQuestion(signals({ legalMarkers: true, writeVerb: true })),
    ).toBe(false);
  });

  it('ajoute la base juridique à une lecture qui a une dimension juridique', () => {
    const weak = { coverage: 0.3, matchedTerms: 1, documents: [] };
    expect(
      answerSources('READ', signals({ legalMarkers: true, legalKb: weak })),
    ).toEqual(['db', 'legal_kb', 'model']);
    expect(answerSources('READ', signals({ legalKb: weak }))).toEqual([
      'db',
      'model',
    ]);
    expect(answerSources('CONVERSATIONAL', signals())).toEqual(['model']);
  });
});

describe('IntentDetectionService — routage par sources', () => {
  const service = new IntentDetectionService(
    {
      getAllHandlers: jest.fn(() => []),
      generateGlobalWriteSchema: jest.fn(async () => ''),
    } as any,
    {
      domainKeywords: ['dossier', 'dossiers', 'client', 'clients', 'facture'],
    } as any,
  );
  const classifier = (answer: string | Error) => {
    const invoke = jest.fn(async () => {
      if (answer instanceof Error) throw answer;
      return { content: answer };
    });
    return { invoke } as any;
  };

  it('calcule les indices sans tenir compte du contexte de page', () => {
    const result = service.computeSourceSignals(
      'Qu\'est-ce que la prescription ?\n\n--- CONTEXTE DE LA PAGE ---\n{"pathname":"/dossiers/39"}',
      [match(0.8)],
    );
    expect(result).toMatchObject({
      recordReference: null,
      cabinetAnchor: false,
      domainKeyword: false,
      legalMarkers: true,
      pathname: '/dossiers/39',
    });
    expect(result.legalKb?.coverage).toBe(0.8);

    expect(
      service.computeSourceSignals(
        "Le délai d'appel du dossier DOS-2026-0039 est-il dépassé ?",
      ),
    ).toMatchObject({
      recordReference: 'DOS-2026-0039',
      cabinetAnchor: true,
      domainKeyword: true,
    });
  });

  it('répond par les connaissances sans classifieur quand la base juridique couvre la question', async () => {
    const question = 'hypothèque judiciaire conservatoire sur un immeuble';
    expect(service.classifyLocal(question)).toBeNull();
    const llm = classifier('READ');
    const result = await service.detectIntent(question, llm, '', {
      signals: service.computeSourceSignals(question, [match(0.8)]),
    });
    expect(result.type).toBe('CONVERSATIONAL');
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it('lit la base quand le classifieur répond CHAT sur un numéro cité', async () => {
    const question = 'que penses-tu de DOS-2026-0039 ?';
    expect(service.classifyLocal(question)).toBeNull();
    const result = await service.detectIntent(
      question,
      classifier('CHAT'),
      '',
      {
        signals: service.computeSourceSignals(question),
      },
    );
    expect(result.type).toBe('READ');
  });

  it('retombe sur les connaissances quand le classifieur ne répond pas à une question sans lien avec le cabinet', async () => {
    const question = 'hypothèque judiciaire conservatoire sur un immeuble';
    const empty = await service.detectIntent(question, classifier(''), '', {
      signals: service.computeSourceSignals(question),
    });
    expect(empty.type).toBe('CONVERSATIONAL');

    const failing = await service.detectIntent(
      question,
      classifier(new Error('timeout')),
      '',
      {
        signals: service.computeSourceSignals(question),
      },
    );
    expect(failing.type).toBe('CONVERSATIONAL');
  });

  it('garde la lecture quand le classifieur ne répond pas sur une question du cabinet', async () => {
    const question = 'point mensuel de mes clients';
    expect(service.classifyLocal(question)).toBeNull();
    const result = await service.detectIntent(question, classifier(''), '', {
      signals: service.computeSourceSignals(question),
    });
    expect(result.type).toBe('READ');
  });

  it("ne réutilise pas une classification d'une autre conversation", async () => {
    const question = 'et pour celle du mois dernier ?';
    const first = classifier('READ');
    await service.detectIntent(question, first, '', {
      history: 'Utilisateur : liste les factures',
    });
    const second = classifier('CHAT');
    await service.detectIntent(question, second, '', {
      history: 'Utilisateur : bonjour',
    });
    expect(second.invoke).toHaveBeenCalledTimes(1);
  });
});
