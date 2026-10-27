/// <reference types="jest" />
import {
  numericEnumColumnsFromMetadata,
  quoteNumericEnumLiterals,
} from './numeric-enum-literals';

const columns = new Map([
  ['dossiers', new Set(['status', 'danger_level'])],
]);
const fix = (sql: string) => quoteNumericEnumLiterals(sql, columns);

describe('quoteNumericEnumLiterals', () => {
  it('quote les comparaisons = / <> / != sur la colonne ENUM', () => {
    expect(fix('SELECT d.id FROM dossiers d WHERE d.status = 0 AND d.danger_level<>3')).toBe(
      "SELECT d.id FROM dossiers d WHERE d.status = '0' AND d.danger_level<>'3'",
    );
    expect(fix('SELECT id FROM dossiers WHERE status != 8')).toBe(
      "SELECT id FROM dossiers WHERE status != '8'",
    );
    expect(fix('SELECT id FROM dossiers WHERE dossiers.status = 10')).toBe(
      "SELECT id FROM dossiers WHERE dossiers.status = '10'",
    );
  });

  it("quote aussi l'ordre inversé et les identifiants entre backticks", () => {
    expect(fix('SELECT `d`.id FROM `dossiers` AS `d` WHERE 9 = `d`.`status`')).toBe(
      "SELECT `d`.id FROM `dossiers` AS `d` WHERE '9' = `d`.`status`",
    );
  });

  it('quote les listes IN / NOT IN de littéraux', () => {
    expect(fix('SELECT d.id FROM dossiers d WHERE d.status IN (8, 9,10) AND d.danger_level NOT IN (0)')).toBe(
      "SELECT d.id FROM dossiers d WHERE d.status IN ('8', '9','10') AND d.danger_level NOT IN ('0')",
    );
    // Liste mixte : seuls les entiers nus sont quotés.
    expect(fix("SELECT d.id FROM dossiers d WHERE d.status IN ('1', 2)")).toBe(
      "SELECT d.id FROM dossiers d WHERE d.status IN ('1', '2')",
    );
  });

  it('laisse les sous-requêtes IN intactes', () => {
    const sql = 'SELECT d.id FROM dossiers d WHERE d.status IN (SELECT 1 FROM dual)';
    expect(fix(sql)).toBe(sql);
  });

  it('quote les WHEN d’un CASE simple sur la colonne, sans toucher aux CASE imbriqués', () => {
    const sql =
      "SELECT d.dossier_number, CASE d.status WHEN 0 THEN 'Ouvert' WHEN 1 THEN 'Analyse préliminaire' " +
      "WHEN 2 THEN CASE x.kind WHEN 5 THEN 'a' END ELSE 'Autre' END AS statut, " +
      'CASE d.danger_level WHEN 3 THEN 1 ELSE 0 END AS critique ' +
      "FROM dossiers d JOIN other x ON x.id = d.id WHERE d.dossier_number = 'DOS-2026-0038'";
    expect(fix(sql)).toBe(
      "SELECT d.dossier_number, CASE d.status WHEN '0' THEN 'Ouvert' WHEN '1' THEN 'Analyse préliminaire' " +
        "WHEN '2' THEN CASE x.kind WHEN 5 THEN 'a' END ELSE 'Autre' END AS statut, " +
        "CASE d.danger_level WHEN '3' THEN 1 ELSE 0 END AS critique " +
        "FROM dossiers d JOIN other x ON x.id = d.id WHERE d.dossier_number = 'DOS-2026-0038'",
    );
  });

  it('quote les CASE recherchés via la comparaison', () => {
    expect(fix("SELECT CASE WHEN d.status = 8 THEN 'Clôturé' ELSE 'Actif' END FROM dossiers d")).toBe(
      "SELECT CASE WHEN d.status = '8' THEN 'Clôturé' ELSE 'Actif' END FROM dossiers d",
    );
  });

  it('compare les bornes sur la valeur numérique (CAST) et non sur l’index', () => {
    expect(fix('SELECT d.id FROM dossiers d WHERE d.status >= 8 AND d.danger_level BETWEEN 2 AND 3')).toBe(
      'SELECT d.id FROM dossiers d WHERE CAST(d.status AS CHAR) >= 8 AND CAST(d.danger_level AS CHAR) BETWEEN 2 AND 3',
    );
    expect(fix('SELECT d.id FROM dossiers d WHERE d.status <=> 1')).toBe(
      "SELECT d.id FROM dossiers d WHERE d.status <=> '1'",
    );
  });

  it('ne touche ni aux chaînes, ni aux commentaires, ni aux autres colonnes', () => {
    const sql =
      "SELECT d.id, 'd.status = 0' AS txt FROM dossiers d " +
      "JOIN billable_items bi ON bi.dossier_id = d.id -- d.status = 1\n" +
      "WHERE d.status = '3' AND bi.status = 2 AND d.tenant_id = 25 AND d.statusx = 4 /* d.status IN (1) */ LIMIT 50";
    expect(fix(sql)).toBe(sql);
  });

  it("ignore une colonne homonyme d'une table sans ENUM numérique", () => {
    const sql = 'SELECT bi.id FROM billable_items bi WHERE bi.status = 1 AND status = 2';
    expect(fix(sql)).toBe(sql);
  });

  it('résout les alias à chaque niveau (sous-requête, jointure par virgule)', () => {
    expect(
      fix('SELECT c.id, (SELECT COUNT(*) FROM dossiers d2 WHERE d2.customer_id = c.id AND d2.status = 3) n FROM customers c, dossiers dd WHERE dd.status=0'),
    ).toBe(
      "SELECT c.id, (SELECT COUNT(*) FROM dossiers d2 WHERE d2.customer_id = c.id AND d2.status = '3') n FROM customers c, dossiers dd WHERE dd.status='0'",
    );
  });

  it('est idempotent', () => {
    const once = fix('SELECT d.id FROM dossiers d WHERE d.status IN (1, 2) AND d.status > 1');
    expect(fix(once)).toBe(once);
  });
});

describe('numericEnumColumnsFromMetadata', () => {
  it('ne garde que les ENUM dont toutes les valeurs sont des entiers', () => {
    const map = numericEnumColumnsFromMetadata([
      {
        tableName: 'Dossiers',
        columns: [
          { type: 'enum', enum: [0, 1, 2, 10], databaseName: 'status' },
          { type: 'enum', enum: ['0', '1', '2', '3'], databaseName: 'danger_level' },
          { type: 'enum', enum: ['TO_INVOICE', 'INVOICED'], databaseName: 'billing_status' },
          { type: 'int', databaseName: 'priority' },
        ],
      },
      { tableName: 'customers', columns: [{ type: 'varchar', databaseName: 'name' }] },
    ]);
    expect(Array.from(map.keys())).toEqual(['dossiers']);
    expect(Array.from(map.get('dossiers')!)).toEqual(['status', 'danger_level']);
  });
});
