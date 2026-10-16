/// <reference types="jest" />
import {
  extractDisplayedRecords,
  formatDisplayedRecordsForPlanner,
  formatSqlDate,
  normalizeMatchValue,
} from './displayed-records';

describe('Enregistrements affichés par une lecture IA', () => {
  it('rend une DATE MySQL (minuit local) sans recul d’un jour', () => {
    expect(formatSqlDate(new Date(2026, 8, 30))).toBe('2026-09-30');
    expect(formatSqlDate(new Date(2026, 9, 12, 13, 35, 56))).toBe('2026-10-12 13:35:56');
  });

  it('retire les colonnes ref__ de l’affichage et les mémorise avec un résumé lisible', () => {
    const { rows, records } = extractDisplayedRecords([
      { ref__payroll_period: 9, label: 'Juin 2023', start_date: new Date(2026, 8, 30), status: 'draft' },
      { ref__payroll_period: 6, label: 'ff', start_date: new Date(2026, 7, 31), status: 'draft' },
    ]);
    expect(rows[0]).toEqual({ label: 'Juin 2023', start_date: '2026-09-30', status: 'draft' });
    expect(records).toEqual([
      { entity: 'payroll_period', id: 9, summary: 'label=Juin 2023, start_date=2026-09-30, status=draft' },
      { entity: 'payroll_period', id: 6, summary: 'label=ff, start_date=2026-08-31, status=draft' },
    ]);
    expect(formatDisplayedRecordsForPlanner(records)).toContain('2. payroll_period #6 : label=ff');
  });

  it('laisse intactes les lignes sans ref__ (agrégats)', () => {
    const { rows, records } = extractDisplayedRecords([{ total: 3 }]);
    expect(rows).toEqual([{ total: 3 }]);
    expect(records).toEqual([]);
  });

  it('convertit les dates françaises et ISO minuit pour la recherche', () => {
    expect(normalizeMatchValue('30/09/2026')).toBe('2026-09-30');
    expect(normalizeMatchValue('2026-09-30T00:00:00.000Z')).toBe('2026-09-30');
    expect(normalizeMatchValue('  ff ')).toBe('ff');
    expect(normalizeMatchValue(7)).toBe(7);
  });
});
