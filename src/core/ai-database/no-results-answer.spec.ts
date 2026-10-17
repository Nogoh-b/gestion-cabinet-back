import {
  buildNoResultsMessage,
  buildNoResultsSuggestions,
  detectNoResultsTarget,
  extractSearchedReferences,
  rankNearbyRecords,
} from './no-results-answer';

const QUESTION =
  'Fais une synthèse du dossier CD-2026-002 : objet, parties, état de la procédure, dernières actions réalisées et prochaines étapes.';

describe('no-results-answer', () => {
  it('repère le numéro cherché et l’objet visé juste avant lui', () => {
    const [reference] = extractSearchedReferences(QUESTION);

    expect(reference).toBe('CD-2026-002');
    // « étapes » et « parties » apparaissent aussi : le mot « dossier » prime.
    expect(detectNoResultsTarget(QUESTION, ['dossiers'], reference)?.key).toBe(
      'dossier',
    );
    expect(
      detectNoResultsTarget(
        'les factures du dossier DOS-2026-0001',
        [],
        'DOS-2026-0001',
      )?.key,
    ).toBe('dossier');
  });

  it('ignore les mots sans chiffre et garde les textes entre guillemets', () => {
    expect(
      extractSearchedReferences('le dossier « Dupont c/ SARL Ndi »'),
    ).toEqual(['Dupont c/ SARL Ndi']);
    expect(extractSearchedReferences('mon e-mail et mon week-end')).toEqual([]);
  });

  it('propose les numéros proches, mêmes nombres d’abord', () => {
    const nearby = rankNearbyRecords('CD-2026-002', [
      { code: 'DOS-2026-0018' },
      { code: 'DOS-2026-0002', label: 'Recouvrement · SARL Ndi' },
      { code: 'DOS-2025-0002' },
    ]);

    expect(nearby.map((r) => r.code)).toEqual(['DOS-2026-0002']);
  });

  it('reconnaît un numéro RG identique', () => {
    const [match] = rankNearbyRecords('CD-2026-002', [
      {
        code: 'DOS-2026-0007',
        aliases: [{ value: 'cd 2026 002', label: 'n° RG' }],
      },
    ]);

    expect(match).toMatchObject({ code: 'DOS-2026-0007', score: 1 });
    expect(match.matchedAlias?.label).toBe('n° RG');
  });

  it('rédige une réponse qui nomme la recherche et les pistes', () => {
    const target = detectNoResultsTarget(QUESTION, ['dossiers'], 'CD-2026-002');
    const nearby = rankNearbyRecords('CD-2026-002', [
      { code: 'DOS-2026-0002', label: 'Recouvrement · SARL Ndi' },
    ]);

    const message = buildNoResultsMessage({
      target,
      references: ['CD-2026-002'],
      nearby,
    });

    expect(message).toContain(
      "Je n'ai trouvé aucun dossier **CD-2026-002** dans le cabinet.",
    );
    expect(message).toContain('- **DOS-2026-0002** — Recouvrement · SARL Ndi');
    expect(message).not.toMatch(/elargissez|criteres/);
    expect(buildNoResultsSuggestions(QUESTION, 'CD-2026-002', nearby)).toEqual([
      {
        label: 'DOS-2026-0002',
        prompt: QUESTION.replace('CD-2026-002', 'DOS-2026-0002'),
      },
    ]);
  });

  it('montre la forme des numéros quand rien n’approche', () => {
    const target = detectNoResultsTarget(QUESTION, ['dossiers'], 'CD-2026-002');

    expect(
      buildNoResultsMessage({
        target,
        references: ['CD-2026-002'],
        nearby: [],
        example: 'DOS-2026-0018',
      }),
    ).toBe(
      "Je n'ai trouvé aucun dossier **CD-2026-002** dans le cabinet, ni de numéro approchant. Les numéros du cabinet ont la forme **DOS-2026-0018**. Précisez le numéro du dossier, le nom du client ou l'objet de l'affaire.",
    );
    expect(
      buildNoResultsMessage({
        target,
        references: ['CD-2026-002'],
        nearby: [],
        empty: true,
      }),
    ).toBe(
      "Je n'ai trouvé aucun dossier **CD-2026-002** : le cabinet n'a encore aucun dossier enregistré.",
    );
  });

  it('accorde au féminin', () => {
    const target = detectNoResultsTarget(
      'la facture FAC-2026-9999',
      ['factures'],
      'FAC-2026-9999',
    );

    expect(
      buildNoResultsMessage({
        target,
        references: ['FAC-2026-9999'],
        nearby: [],
      }),
    ).toMatch(/^Je n'ai trouvé aucune facture \*\*FAC-2026-9999\*\*/);
  });
});
