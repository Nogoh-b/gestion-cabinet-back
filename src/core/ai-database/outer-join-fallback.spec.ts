/// <reference types="jest" />
import { outerJoinRetry, targetsSpecificRecord, widenInnerJoins } from './outer-join-fallback';

describe('Relance en LEFT JOIN d’une lecture vide', () => {
  const summary = `SELECT d.dossier_number, d.object, j.name AS juridiction, c.full_name
FROM dossiers d
JOIN jurisdictions j ON j.id = d.jurisdiction_id
INNER JOIN customer c ON c.id = d.client_id
LEFT JOIN procedure_types pt ON pt.id = d.procedure_type_id
WHERE d.dossier_number = 'DOS-2026-0039'`;

  it('élargit JOIN et INNER JOIN, garde les LEFT JOIN', () => {
    const widened = widenInnerJoins(summary)!;
    expect(widened).toContain('LEFT JOIN jurisdictions j');
    expect(widened).toContain('LEFT JOIN customer c');
    expect(widened).toContain('LEFT JOIN procedure_types pt');
    expect(widened).not.toMatch(/INNER\s+JOIN|LEFT\s+LEFT/i);
  });

  it('ne touche ni LEFT OUTER JOIN, ni CROSS JOIN, ni le texte des chaînes', () => {
    expect(widenInnerJoins('SELECT 1 FROM a LEFT OUTER JOIN b ON b.id = a.b_id CROSS JOIN c')).toBeNull();
    expect(widenInnerJoins("SELECT 1 FROM a WHERE a.note = 'join us'")).toBeNull();
  });

  it('ne relance que pour un enregistrement précis', () => {
    expect(targetsSpecificRecord(summary)).toBe(true);
    expect(targetsSpecificRecord('SELECT 1 FROM dossiers d JOIN x ON x.id = d.x_id WHERE d.id = 94')).toBe(true);
    expect(targetsSpecificRecord("SELECT 1 FROM factures f JOIN x ON 1=1 WHERE f.numero = 'FAC-2026-01'")).toBe(true);
    // « Dossiers qui ont une facture » : la jointure est le filtre voulu.
    expect(outerJoinRetry('SELECT d.dossier_number FROM dossiers d JOIN factures f ON f.dossier_id = d.id WHERE f.status = 2')).toBeNull();
    expect(outerJoinRetry('SELECT d.dossier_number FROM dossiers d JOIN factures f ON f.dossier_id = d.id')).toBeNull();
  });

  it('renvoie la requête élargie pour une synthèse de dossier', () => {
    expect(outerJoinRetry(summary)).toContain('LEFT JOIN customer c');
  });
});
