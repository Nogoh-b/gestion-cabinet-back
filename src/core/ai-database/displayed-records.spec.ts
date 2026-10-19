/// <reference types="jest" />
import {
  extractDisplayedRecords,
  formatDisplayedRecordsForPlanner,
  formatSqlDate,
  normalizeMatchValue,
  withRecordRefs,
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
      { entity: 'payroll_period', id: 9, summary: 'label=Juin 2023, start_date=2026-09-30, status=draft', label: 'Juin 2023' },
      { entity: 'payroll_period', id: 6, summary: 'label=ff, start_date=2026-08-31, status=draft', label: 'ff' },
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

  describe('identifiant ajouté aux listes', () => {
    const hasId = (table: string) => ['dossiers', 'customer'].includes(table);

    it('ajoute la clé primaire de la table principale, alias compris', () => {
      expect(withRecordRefs('SELECT c.full_name, c.customer_code FROM customer c WHERE c.status = 1', hasId))
        .toBe('SELECT c.full_name, c.customer_code, c.id AS ref__customer FROM customer c WHERE c.status = 1');
      expect(withRecordRefs('SELECT dossier_number FROM dossiers LEFT JOIN customer ON 1=1', hasId))
        .toBe('SELECT dossier_number, dossiers.id AS ref__dossiers FROM dossiers LEFT JOIN customer ON 1=1');
      expect(withRecordRefs("SELECT EXTRACT(YEAR FROM d.opened_at) AS y, d.dossier_number FROM `dossiers` AS d", hasId))
        .toContain(', d.id AS ref__dossiers FROM `dossiers` AS d');
    });

    it('laisse intactes les requêtes agrégées, dédoublonnées ou déjà référencées', () => {
      for (const sql of [
        'SELECT COUNT(*) AS total FROM dossiers d',
        'SELECT d.status, COUNT(*) FROM dossiers d GROUP BY d.status',
        'SELECT DISTINCT d.status FROM dossiers d',
        'SELECT d.dossier_number, d.id AS ref__dossiers FROM dossiers d',
        'SELECT a.label FROM audiences a',
        'SELECT x.n FROM (SELECT 1 AS n) x',
        'SELECT d.dossier_number FROM dossiers d UNION SELECT c.full_name FROM customer c',
      ]) {
        expect(withRecordRefs(sql, hasId)).toBe(sql);
      }
    });
  });
});
