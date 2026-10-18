/// <reference types="jest" />
import { pruneDeniedJoins } from './denied-join-pruning';

const normalize = (sql: string | null) =>
  (sql ?? '').replace(/\s+/g, ' ').trim();

describe('Retrait des jointures vers une table non lisible', () => {
  it('retire le LEFT JOIN vers user et la colonne du responsable', () => {
    const pruned = pruneDeniedJoins(
      `SELECT da.title, d.dossier_number, CONCAT(u.first_name, ' ', u.last_name) AS responsable
FROM dossier_actions da
JOIN dossiers d ON d.id = da.dossier_id
LEFT JOIN user u ON u.id = da.responsible_user_id
WHERE da.due_date < CURDATE() AND da.status <> 2
LIMIT 50`,
      ['user'],
    );
    expect(normalize(pruned)).toBe(
      'SELECT da.title, d.dossier_number FROM dossier_actions da JOIN dossiers d ON d.id = da.dossier_id WHERE da.due_date < CURDATE() AND da.status <> 2 LIMIT 50',
    );
  });

  it('retire une chaîne de jointures (employee puis user)', () => {
    const pruned = pruneDeniedJoins(
      `SELECT da.title, CONCAT(u.first_name, ' ', u.last_name) AS responsable
FROM dossier_actions da
LEFT JOIN employee e ON e.id = da.responsible_user_id
LEFT JOIN user u ON u.id = e.id
WHERE da.status = 0`,
      ['employee', 'user'],
    );
    expect(normalize(pruned)).toBe(
      'SELECT da.title FROM dossier_actions da WHERE da.status = 0',
    );
  });

  it('retire une jointure sans alias, référencée par le nom de table', () => {
    const pruned = pruneDeniedJoins(
      'SELECT da.title, user.last_name FROM dossier_actions da LEFT JOIN user ON user.id = da.responsible_user_id',
      ['user'],
    );
    expect(normalize(pruned)).toBe('SELECT da.title FROM dossier_actions da');
  });

  it('refuse (null) quand la colonne retirée sert à filtrer', () => {
    expect(
      pruneDeniedJoins(
        "SELECT da.title FROM dossier_actions da LEFT JOIN user u ON u.id = da.responsible_user_id WHERE CONCAT(u.first_name, u.last_name) LIKE '%Dupont%'",
        ['user'],
      ),
    ).toBeNull();
  });

  it('refuse un INNER JOIN, qui filtre les lignes sans correspondance', () => {
    expect(
      pruneDeniedJoins(
        'SELECT da.title, u.last_name FROM dossier_actions da INNER JOIN user u ON u.id = da.responsible_user_id',
        ['user'],
      ),
    ).toBeNull();
    expect(
      pruneDeniedJoins(
        'SELECT da.title, u.last_name FROM dossier_actions da JOIN user u ON u.id = da.responsible_user_id',
        ['user'],
      ),
    ).toBeNull();
  });

  it('refuse SELECT * : les colonnes de la jointure fuiraient', () => {
    expect(
      pruneDeniedJoins(
        'SELECT * FROM dossier_actions da LEFT JOIN user u ON u.id = da.responsible_user_id',
        ['user'],
      ),
    ).toBeNull();
  });

  it("refuse une jointure qui n'est pas une recherche sur la clé primaire", () => {
    expect(
      pruneDeniedJoins(
        'SELECT da.title, u.last_name FROM dossier_actions da LEFT JOIN user u ON u.email = da.contact_email',
        ['user'],
      ),
    ).toBeNull();
  });

  it('refuse quand un alias retiré est encore utilisé ailleurs (ORDER BY sur le libellé)', () => {
    expect(
      pruneDeniedJoins(
        'SELECT da.title, CONCAT(u.last_name) AS responsable FROM dossier_actions da LEFT JOIN user u ON u.id = da.responsible_user_id ORDER BY responsable',
        ['user'],
      ),
    ).toBeNull();
  });

  it('refuse une table non lisible dans FROM (rien à retirer proprement)', () => {
    expect(
      pruneDeniedJoins('SELECT u.last_name FROM user u', ['user']),
    ).toBeNull();
  });

  it('ignore le texte des chaînes et des commentaires', () => {
    expect(
      pruneDeniedJoins(
        "SELECT da.title FROM dossier_actions da WHERE da.note = 'LEFT JOIN user u ON u.id = da.x' -- LEFT JOIN user",
        ['user'],
      ),
    ).toBeNull();
  });
});
