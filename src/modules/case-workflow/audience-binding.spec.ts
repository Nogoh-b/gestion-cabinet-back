import { describe, expect, it } from '@jest/globals';
import {
  buildAudiencePatch,
  collectAudienceBindings,
} from './audience-binding';

const schemaWith = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
});

describe('collectAudienceBindings', () => {
  it('collecte les liaisons déclarées avec la forme complète', () => {
    const bindings = collectAudienceBindings(
      schemaWith({
        compte_rendu: {
          type: 'string',
          binding: { entity: 'audience', field: 'report_content' },
        },
        duree: {
          type: 'integer',
          binding: { entity: 'audience', field: 'duration_minutes' },
        },
      }),
    );

    expect(bindings).toEqual([
      { sourceKey: 'compte_rendu', target: 'report_content' },
      { sourceKey: 'duree', target: 'duration_minutes' },
    ]);
  });

  it('accepte la forme courte héritée audience_field', () => {
    const bindings = collectAudienceBindings(
      schemaWith({ remarques: { type: 'string', audience_field: 'notes' } }),
    );

    expect(bindings).toEqual([{ sourceKey: 'remarques', target: 'notes' }]);
  });

  it('écarte les cibles absentes de la liste blanche', () => {
    const bindings = collectAudienceBindings(
      schemaWith({
        pirate: {
          type: 'string',
          binding: { entity: 'audience', field: 'tenant_id' },
        },
        pirate2: {
          type: 'string',
          binding: { entity: 'audience', field: 'dossier_id' },
        },
        pirate3: {
          type: 'string',
          binding: { entity: 'audience', field: 'status' },
        },
      }),
    );

    expect(bindings).toEqual([]);
  });

  it('ignore les liaisons visant une autre entité', () => {
    const bindings = collectAudienceBindings(
      schemaWith({
        titre: {
          type: 'string',
          binding: { entity: 'document', field: 'report_content' },
        },
      }),
    );

    expect(bindings).toEqual([]);
  });

  it('ne retient que la première liaison visant une même colonne', () => {
    const bindings = collectAudienceBindings(
      schemaWith({
        premier: {
          type: 'string',
          binding: { entity: 'audience', field: 'notes' },
        },
        second: {
          type: 'string',
          binding: { entity: 'audience', field: 'notes' },
        },
      }),
    );

    expect(bindings).toEqual([{ sourceKey: 'premier', target: 'notes' }]);
  });

  it('tolère un schéma absent ou malformé', () => {
    expect(collectAudienceBindings(null)).toEqual([]);
    expect(collectAudienceBindings(undefined)).toEqual([]);
    expect(collectAudienceBindings({})).toEqual([]);
    expect(collectAudienceBindings({ properties: 'nope' })).toEqual([]);
    expect(collectAudienceBindings({ properties: { champ: null } })).toEqual(
      [],
    );
  });
});

describe('buildAudiencePatch', () => {
  it('recopie et normalise les valeurs typées', () => {
    const { patch, issues } = buildAudiencePatch(
      [
        { sourceKey: 'compte_rendu', target: 'report_content' },
        { sourceKey: 'duree', target: 'duration_minutes' },
        { sourceKey: 'rendu_le', target: 'decision_date' },
      ],
      {
        compte_rendu: '  Audience tenue en chambre du conseil.  ',
        duree: '45',
        rendu_le: '2026-03-12',
      },
    );

    expect(issues).toEqual([]);
    expect(patch.report_content).toBe('Audience tenue en chambre du conseil.');
    expect(patch.duration_minutes).toBe(45);
    expect(patch.decision_date).toBeInstanceOf(Date);
    expect((patch.decision_date as Date).getHours()).toBe(0);
  });

  it('ignore les valeurs absentes ou vides sans effacer l’audience', () => {
    const { patch, issues } = buildAudiencePatch(
      [
        { sourceKey: 'compte_rendu', target: 'report_content' },
        { sourceKey: 'absent', target: 'notes' },
        { sourceKey: 'vide', target: 'decision' },
        { sourceKey: 'nul', target: 'judge_name' },
      ],
      { compte_rendu: 'PV', vide: '   ', nul: null },
    );

    expect(issues).toEqual([]);
    expect(patch).toEqual({ report_content: 'PV' });
  });

  it('refuse un entier invalide', () => {
    const { patch, issues } = buildAudiencePatch(
      [{ sourceKey: 'duree', target: 'duration_minutes' }],
      { duree: 'beaucoup' },
    );

    expect(patch).toEqual({});
    expect(issues[0]).toContain('Durée réelle');
    expect(issues[0]).toContain('nombre entier positif');
  });

  it('refuse une date invalide', () => {
    const { issues } = buildAudiencePatch(
      [{ sourceKey: 'rendu_le', target: 'decision_date' }],
      { rendu_le: 'pas-une-date' },
    );

    expect(issues[0]).toContain('la date est invalide');
  });

  it('refuse un dépassement de longueur plutôt que de tronquer', () => {
    const { patch, issues } = buildAudiencePatch(
      [{ sourceKey: 'juge', target: 'judge_name' }],
      { juge: 'A'.repeat(256) },
    );

    expect(patch).toEqual({});
    expect(issues[0]).toContain('255 caractères');
  });

  it('accepte une valeur juste à la limite de longueur', () => {
    const { patch, issues } = buildAudiencePatch(
      [{ sourceKey: 'salle', target: 'room' }],
      { salle: 'B'.repeat(50) },
    );

    expect(issues).toEqual([]);
    expect(patch.room).toBe('B'.repeat(50));
  });

  it('n’écrit jamais une cible hors liste blanche', () => {
    const { patch } = buildAudiencePatch(
      [{ sourceKey: 'x', target: 'tenant_id' }],
      { x: 42 },
    );

    expect(patch).toEqual({});
  });
});
