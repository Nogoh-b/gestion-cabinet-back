import {
  calculateActionBilling,
  findForbiddenJsonLogicOperator,
  recommendationTriggersForEvaluation,
  recommendationScore,
  resolveLegacyMapping,
  shouldSuppressRecommendationAction,
  validateDeadlineExtension,
  validateDynamicPayload,
  validateRequiredRelations,
} from './case-workflow.logic';
import {
  ActionBillingDecision,
  BillingCalculationMode,
  RecommendationTrigger,
} from './case-workflow.enums';
import { describe, expect, it } from '@jest/globals';

describe('case-workflow business rules', () => {
  it('valide les champs dynamiques obligatoires et leur type', () => {
    const schema = {
      required: ['analysis', 'risk'],
      properties: { analysis: { type: 'string' }, risk: { type: 'integer' } },
    };
    expect(validateDynamicPayload(schema, { analysis: '', risk: 2.5 })).toEqual(
      [
        expect.objectContaining({ field: 'analysis' }),
        expect.objectContaining({ field: 'risk' }),
      ],
    );
    expect(
      validateDynamicPayload(schema, { analysis: 'Risque maîtrisé', risk: 2 }),
    ).toEqual([]);
  });

  it('réserve les champs de résultat obligatoires à la complétion', () => {
    const schema = {
      required: ['analysis'],
      required_on_start: ['question'],
      properties: {
        analysis: { type: 'string' },
        question: { type: 'string' },
      },
    };

    expect(validateDynamicPayload(schema, {}, 'required_on_start')).toEqual([
      expect.objectContaining({ field: 'question' }),
    ]);
    expect(
      validateDynamicPayload(
        schema,
        { question: 'Quels sont les risques ?' },
        'required_on_start',
      ),
    ).toEqual([]);
    expect(
      validateDynamicPayload(schema, { question: 'Quels sont les risques ?' }),
    ).toEqual([expect.objectContaining({ field: 'analysis' })]);
  });

  it('refuse une valeur dynamique hors de la liste autorisée', () => {
    const schema = {
      properties: {
        outcome: { type: 'string', enum: ['ACCEPTED', 'REJECTED'] },
      },
    };
    expect(validateDynamicPayload(schema, { outcome: 'UNKNOWN' })).toEqual([
      expect.objectContaining({ field: 'outcome' }),
    ]);
    expect(validateDynamicPayload(schema, { outcome: 'ACCEPTED' })).toEqual([]);
  });

  it('fait respecter les relations obligatoires de la version de dÃ©finition', () => {
    const requirements = {
      documents: { min: 1, roles: ['EVIDENCE'] },
      audiences: true,
    };
    expect(
      validateRequiredRelations(requirements, {
        documents: [{ role: 'INPUT' }],
        audiences: [],
      }),
    ).toHaveLength(2);
    expect(
      validateRequiredRelations(requirements, {
        documents: [{ role: 'EVIDENCE' }],
        audiences: [{ role: 'INPUT' }],
      }),
    ).toEqual([]);
  });

  it('rÃ©sout une correspondance de migration sans dÃ©pendre des accents', () => {
    const mappings = [
      {
        match_pattern: 'audience|plaidoirie',
        match_mode: 'CONTAINS' as const,
        action_definition_code: 'PREPARE_HEARING',
      },
      {
        match_pattern: 'cloture finale',
        match_mode: 'EXACT' as const,
        action_definition_code: 'PREPARE_CLOSURE',
      },
    ];
    expect(
      resolveLegacyMapping('PrÃ©paration de la plaidoirie', mappings),
    ).toBe('PREPARE_HEARING');
    expect(resolveLegacyMapping('Cl\u00f4ture finale', mappings)).toBe(
      'PREPARE_CLOSURE',
    );
    expect(
      resolveLegacyMapping('Cl\u00f4ture finale du dossier', mappings),
    ).toBeNull();
  });

  it('refuse un opérateur json-logic hors liste blanche', () => {
    expect(
      findForbiddenJsonLogicOperator({ and: [{ '==': [1, 1] }, { var: 'x' }] }),
    ).toBeNull();
    expect(findForbiddenJsonLogicOperator({ log: ['secret'] })).toBe('log');
  });

  it('classe la criticité avant la priorité de règle', () => {
    const critical = recommendationScore({
      dangerLevel: 3,
      dossierPriority: 0,
      nextDeadlineInDays: 30,
      rulePriority: 1,
      specificity: 1,
    });
    const ordinary = recommendationScore({
      dangerLevel: 0,
      dossierPriority: 0,
      nextDeadlineInDays: 1,
      rulePriority: 100,
      specificity: 100,
    });
    expect(critical).toBeGreaterThan(ordinary);
  });

  it('ne rejoue pas les règles d’ouverture lors du recalcul du workspace', () => {
    expect(
      recommendationTriggersForEvaluation(RecommendationTrigger.MANUAL),
    ).toEqual([
      RecommendationTrigger.MANUAL,
      RecommendationTrigger.NO_OPEN_ACTION,
    ]);
    expect(
      recommendationTriggersForEvaluation(
        RecommendationTrigger.OPENING_VALIDATED,
      ),
    ).toEqual([
      RecommendationTrigger.OPENING_VALIDATED,
      RecommendationTrigger.NO_OPEN_ACTION,
    ]);
  });

  it('évite de recommander immédiatement la même action sans action ouverte', () => {
    expect(
      shouldSuppressRecommendationAction({
        ruleTrigger: RecommendationTrigger.NO_OPEN_ACTION,
        definitionCode: 'UPDATE_CASE_DATA',
        openDefinitionCodes: [],
        lastCompletedDefinitionCode: 'UPDATE_CASE_DATA',
      }),
    ).toBe(true);
    expect(
      shouldSuppressRecommendationAction({
        ruleTrigger: RecommendationTrigger.NO_OPEN_ACTION,
        definitionCode: 'UPDATE_CASE_DATA',
        openDefinitionCodes: [],
        lastCompletedDefinitionCode: 'ANALYSE_DOSSIER',
      }),
    ).toBe(false);
  });

  it('calcule un honoraire horaire et sa taxe sans dérive décimale', () => {
    expect(
      calculateActionBilling({
        decision: ActionBillingDecision.BILLABLE,
        mode: BillingCalculationMode.HOURLY,
        durationMinutes: 90,
        hourlyRate: 20_000,
        taxRate: 19.25,
      }),
    ).toEqual({
      quantity: 1.5,
      unitPrice: 20_000,
      net: 30_000,
      tax: 5_775,
      gross: 35_775,
      reviewReason: null,
    });
  });

  it('crée un calcul à revoir quand le tarif manque', () => {
    expect(
      calculateActionBilling({
        decision: ActionBillingDecision.BILLABLE,
        mode: BillingCalculationMode.FIXED,
        taxRate: 19.25,
      }),
    ).toEqual(
      expect.objectContaining({
        net: 0,
        gross: 0,
        reviewReason: 'Tarif forfaitaire manquant',
      }),
    );
  });

  it('calcule un honoraire au pourcentage sur sa base', () => {
    expect(
      calculateActionBilling({
        decision: ActionBillingDecision.BILLABLE,
        mode: BillingCalculationMode.PERCENTAGE,
        percentageRate: 12.5,
        percentageBase: 800_000,
        taxRate: 19.25,
      }),
    ).toEqual({
      quantity: 0.125,
      unitPrice: 800_000,
      net: 100_000,
      tax: 19_250,
      gross: 119_250,
      reviewReason: null,
    });
  });

  it('accepte uniquement une prolongation future et postérieure à l’échéance actuelle', () => {
    const now = new Date('2026-09-07T12:00:00.000Z');
    const current = new Date('2026-09-08T12:00:00.000Z');

    expect(
      validateDeadlineExtension(
        current,
        new Date('2026-09-09T12:00:00.000Z'),
        now,
      ),
    ).toBeNull();
    expect(
      validateDeadlineExtension(
        current,
        new Date('2026-09-08T11:00:00.000Z'),
        now,
      ),
    ).toContain('postérieure');
    expect(
      validateDeadlineExtension(
        null,
        new Date('2026-09-07T11:00:00.000Z'),
        now,
      ),
    ).toContain('futur');
  });
});
