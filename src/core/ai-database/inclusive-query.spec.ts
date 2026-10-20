/// <reference types="jest" />
import { coalesceSums, inclusiveRetryInstruction, keepsAnchors, queryAnchors, sameQuery } from './inclusive-query';

describe('Requêtes inclusives', () => {
  describe('coalesceSums', () => {
    it('remplace une somme NULL (aucune ligne liée) par 0', () => {
      expect(
        coalesceSums('SELECT f.montant_ttc - (SELECT SUM(p.montant) FROM paiements p WHERE p.facture_id = f.id) AS reste FROM factures f'),
      ).toBe(
        'SELECT f.montant_ttc - (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p WHERE p.facture_id = f.id) AS reste FROM factures f',
      );
      expect(coalesceSums('SELECT SUM(CASE WHEN p.status = \'1\' THEN p.montant ELSE 0 END) AS paye FROM paiements p'))
        .toBe("SELECT COALESCE(SUM(CASE WHEN p.status = '1' THEN p.montant ELSE 0 END), 0) AS paye FROM paiements p");
      expect(coalesceSums('SELECT sum(a), SUM(b) FROM t')).toBe('SELECT COALESCE(sum(a), 0), COALESCE(SUM(b), 0) FROM t');
    });

    it('ne touche ni aux sommes déjà protégées, ni aux fenêtres, ni aux tests IS NULL, ni aux chaînes', () => {
      for (const sql of [
        'SELECT COALESCE(SUM(f.montant_ht), 0) AS ca FROM factures f',
        'SELECT IFNULL(SUM(x), 0) FROM t',
        'SELECT SUM(x) OVER (PARTITION BY y) FROM t',
        'SELECT y FROM t GROUP BY y HAVING SUM(x) IS NULL',
        "SELECT 'SUM(x)' AS label FROM t",
      ]) {
        expect(coalesceSums(sql)).toBe(sql);
      }
    });
  });

  describe('relance après un résultat vide', () => {
    const original =
      "SELECT f.numero FROM factures f JOIN dossiers d ON d.id = f.dossier_id WHERE d.dossier_number = 'DOS-2026-0038' AND f.status IN ('2','4') AND f.date_echeance < CURDATE() AND f.tenant_id = 22";

    it('relève les enregistrements visés (numéros, identifiants), hors cabinet', () => {
      expect(queryAnchors(original)).toEqual(['dos-2026-0038']);
      expect(queryAnchors("SELECT * FROM dossiers d WHERE d.id = 90 AND d.tenant_id = 22 AND d.status = '0'")).toEqual(['id=90']);
    });

    it('accepte une relance plus large qui vise toujours le même dossier', () => {
      const retry =
        "SELECT f.numero, GREATEST(DATEDIFF(CURDATE(), f.date_echeance), 0) AS jours_retard FROM factures f JOIN dossiers d ON d.id = f.dossier_id WHERE d.dossier_number = 'DOS-2026-0038' AND f.status <> '5'";
      expect(keepsAnchors(original, retry)).toBe(true);
    });

    it('refuse une relance qui ne vise plus le dossier cité', () => {
      expect(keepsAnchors(original, "SELECT f.numero FROM factures f WHERE f.status <> '5'")).toBe(false);
      expect(keepsAnchors('SELECT * FROM factures f WHERE f.dossier_id = 90', 'SELECT * FROM factures f WHERE f.dossier_id = 91')).toBe(false);
    });

    it('reconnaît une relance identique', () => {
      expect(sameQuery('SELECT a\nFROM t;', 'select a from t')).toBe(true);
    });

    it('rappelle la question, la requête vide et les consignes', () => {
      const prompt = inclusiveRetryInstruction('Liste les factures impayées du dossier DOS-2026-0038', original);
      expect(prompt).toContain('Liste les factures impayées du dossier DOS-2026-0038');
      expect(prompt).toContain(original);
      expect(prompt).toContain('garde OBLIGATOIREMENT les filtres sur les enregistrements cités');
    });
  });
});
