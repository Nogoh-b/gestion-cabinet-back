import { describe, expect, it } from '@jest/globals';
import { buildChartSpec, columnLabel } from './chart-spec';

describe('graphique des réponses du chat', () => {
  const byStatus = [
    { statut: 'En cours', nombre: '12', ref__dossiers: 4 },
    { statut: 'Clôturé', nombre: 5 },
    { statut: 'Suspendu', nombre: 2 },
  ];

  it('trace en barres un nombre par libellé, sans les colonnes d’identifiant', () => {
    const chart = buildChartSpec(byStatus, 'combien de dossiers par statut ?')!;
    expect(chart).toMatchObject({ type: 'bar', xKey: 'statut', series: [{ key: 'nombre', label: 'Nombre' }] });
    expect(chart.data[0]).toEqual({ statut: 'En cours', nombre: 12 });
  });

  it('trace une courbe pour une suite de mois, triée, avec l’unité des montants', () => {
    const chart = buildChartSpec([
      { mois: '2026-09', montant_ttc: 250000 },
      { mois: '2026-08', montant_ttc: 100000 },
    ], 'évolution du chiffre d’affaires par mois')!;
    expect(chart.type).toBe('line');
    expect(chart.unit).toBe('FCFA');
    expect(chart.data.map((point) => point.mois)).toEqual(['2026-08', '2026-09']);
    expect(chart.series[0].label).toBe('Montant TTC');
  });

  it('trace un camembert pour une répartition courte', () => {
    expect(buildChartSpec(byStatus, 'répartition des dossiers par statut')?.type).toBe('pie');
  });

  it('ne trace rien pour une simple liste, une seule ligne ou des valeurs nulles', () => {
    expect(buildChartSpec(byStatus, 'liste des dossiers en cours')).toBeNull();
    expect(buildChartSpec([byStatus[0]], 'combien de dossiers par statut ?')).toBeNull();
    expect(buildChartSpec([{ statut: 'A', nombre: 0 }, { statut: 'B', nombre: 0 }], 'nombre par statut')).toBeNull();
    expect(buildChartSpec([{ nom: 'A', ville: 'Douala' }, { nom: 'B', ville: 'Yaoundé' }], 'total par ville')).toBeNull();
  });

  it('libellés lisibles', () => {
    expect(columnLabel('reste_du')).toBe('Reste du');
    expect(columnLabel('montantTTC')).toBe('Montant TTC');
  });
});
