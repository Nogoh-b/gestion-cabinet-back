/// <reference types="jest" />
import { AiDatabaseService } from './ai-database.service';

function serviceWithTables(tables: string[], shared: string[] = []) {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.logger = { debug: jest.fn(), warn: jest.fn() };
  service._tenantTablesCache = new Set(tables);
  service._sharedTenantTablesCache = new Set(shared);
  return service;
}

describe('injectTenantConditions', () => {
  it('garde la ligne principale quand une jointure externe ne correspond à rien', () => {
    const service = serviceWithTables(['dossiers', 'jurisdictions']);
    const sql = service.injectTenantConditions(
      "SELECT d.id FROM dossiers d LEFT JOIN jurisdictions j ON j.id = d.jurisdiction_id WHERE d.dossier_number = 'DOS-1' LIMIT 50",
      25,
    );
    expect(sql).toContain('d.tenant_id = 25');
    expect(sql).toContain('(j.tenant_id = 25 OR j.tenant_id IS NULL)');
    expect(sql).toMatch(/LIMIT 50$/);
  });

  it('reste strict sur les jointures internes et la table principale', () => {
    const service = serviceWithTables(['dossiers', 'customer']);
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d INNER JOIN customer c ON c.id = d.client_id',
      25,
    );
    expect(sql).toContain('d.tenant_id = 25 AND c.tenant_id = 25');
    expect(sql).not.toContain('IS NULL');
  });

  it('applique aussi la tolérance aux référentiels partagés joints en externe', () => {
    const service = serviceWithTables(
      ['dossiers', 'audience_types'],
      ['audience_types'],
    );
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d LEFT OUTER JOIN audience_types t ON t.id = d.type_id',
      25,
    );
    expect(sql).toContain('(t.tenant_id IN (1, 25) OR t.tenant_id IS NULL)');
  });

  it('garde le WHERE principal intact quand des sous-requêtes ont leur propre WHERE', () => {
    // Synthèse de dossier générée par DeepSeek : le premier WHERE du texte est
    // celui d'une sous-requête. Il était pris pour le WHERE principal → SQL
    // invalide → « aucune donnée » sur un dossier pourtant renseigné.
    const service = serviceWithTables([
      'dossiers',
      'customer',
      'dossier_actions',
      'audiences',
      'user',
    ]);
    const sql = service.injectTenantConditions(
      [
        'SELECT d.dossier_number,',
        "  (SELECT COUNT(*) FROM dossier_actions da WHERE da.dossier_id = d.id AND da.tenant_id = 25 AND da.status = 'TODO') AS actions_todo,",
        '  (SELECT MIN(a.audience_date) FROM audiences a WHERE a.dossier_id = d.id AND a.audience_date >= CURDATE()) AS prochaine_audience',
        'FROM dossiers d',
        'LEFT JOIN customer c ON c.id = d.client_id AND c.tenant_id = 25',
        'LEFT JOIN user u ON u.id = d.lawyer_id',
        'WHERE d.id = 92 AND d.tenant_id = 25',
        'LIMIT 50',
      ].join('\n'),
      25,
    );
    expect(sql).toContain(
      "(SELECT COUNT(*) FROM dossier_actions da WHERE da.dossier_id = d.id AND da.tenant_id = 25 AND da.status = 'TODO')",
    );
    expect(sql).toContain(
      'FROM audiences a WHERE (a.dossier_id = d.id AND a.audience_date >= CURDATE()) AND (a.tenant_id = 25)) AS prochaine_audience',
    );
    expect(sql).toContain(
      'WHERE (d.id = 92 AND d.tenant_id = 25) AND ((u.tenant_id = 25 OR u.tenant_id IS NULL))\nLIMIT 50',
    );
    // Aucun alias de sous-requête dans le filtre principal.
    const mainWhere = sql
      .split('\n')
      .find((line: string) => line.startsWith('WHERE'));
    expect(mainWhere).not.toMatch(/\b(?:da|a)\.tenant_id/);
  });

  it('ajoute le WHERE avant le LIMIT principal, pas avant celui d’une sous-requête', () => {
    const service = serviceWithTables(['dossiers', 'audiences']);
    const sql = service.injectTenantConditions(
      'SELECT d.id, (SELECT a.audience_date FROM audiences a WHERE a.dossier_id = d.id ORDER BY a.audience_date LIMIT 1) AS prochaine FROM dossiers d ORDER BY d.id LIMIT 50',
      25,
    );
    expect(sql).toContain(
      'WHERE (a.dossier_id = d.id) AND (a.tenant_id = 25)\nORDER BY a.audience_date LIMIT 1)',
    );
    expect(sql).toContain(
      'FROM dossiers d WHERE d.tenant_id = 25\nORDER BY d.id LIMIT 50',
    );
  });

  it('filtre chaque branche d’une UNION et ignore les mots entre guillemets', () => {
    const service = serviceWithTables(['dossiers', 'factures']);
    const sql = service.injectTenantConditions(
      "SELECT d.id FROM dossiers d WHERE d.object = 'appel (WHERE x' UNION ALL SELECT f.id FROM factures f",
      25,
    );
    expect(sql).toContain(
      "WHERE (d.object = 'appel (WHERE x') AND (d.tenant_id = 25) UNION ALL",
    );
    expect(sql).toMatch(/FROM factures f WHERE f\.tenant_id = 25$/);
  });

  it('ne réinjecte rien quand le filtre est déjà dans la clause ON', () => {
    const service = serviceWithTables(['dossiers', 'jurisdictions']);
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d LEFT JOIN jurisdictions j ON j.id = d.jurisdiction_id AND j.tenant_id = 25 WHERE d.tenant_id = 25',
      25,
    );
    expect(sql).not.toContain('IS NULL');
  });
});

describe('injectTenantConditions — tables sans tenant_id et personnelles', () => {
  it('limite cabinets à la ligne du cabinet courant', () => {
    const service = serviceWithTables(['dossiers']);
    const sql = service.injectTenantConditions(
      'SELECT c.rccm FROM cabinets c LIMIT 50',
      25,
    );
    expect(sql).toBe(
      'SELECT c.rccm FROM cabinets c WHERE c.`id` = 25\nLIMIT 50',
    );
  });

  it('ne laisse pas un OR contourner le filtre du cabinet', () => {
    const service = serviceWithTables([]);
    const sql = service.injectTenantConditions(
      'SELECT name FROM cabinets WHERE id = 3 OR 1 = 1',
      25,
    );
    expect(sql).toBe(
      'SELECT name FROM cabinets WHERE (id = 3 OR 1 = 1) AND (cabinets.`id` = 25)',
    );
  });

  it('filtre aussi le cabinet 1 et une table jointe par virgule', () => {
    const service = serviceWithTables(['dossiers']);
    const sql = service.injectTenantConditions(
      'SELECT d.id, c.name FROM dossiers d, cabinets c WHERE c.id = d.tenant_id',
      1,
    );
    expect(sql).toContain('c.`id` = 1');
  });

  it("filtre la seconde table d'un FROM à virgules", () => {
    const service = serviceWithTables(['dossiers', 'factures']);
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d, factures f WHERE f.dossier_id = d.id',
      25,
    );
    expect(sql).toContain('d.tenant_id = 25 AND f.tenant_id = 25');
  });

  it('rattache abonnements et échéances au cabinet par cabinet_id', () => {
    const service = serviceWithTables([]);
    const sql = service.injectTenantConditions(
      'SELECT s.status FROM subscriptions s JOIN subscription_payments p ON p.subscription_id = s.id',
      25,
    );
    expect(sql).toContain('s.`cabinet_id` = 25 AND p.`cabinet_id` = 25');
  });

  it("sans utilisateur connu, aucune notification n'est lisible", () => {
    const service = serviceWithTables(['notifications']);
    const sql = service.injectTenantConditions(
      'SELECT n.title FROM notifications n',
      25,
    );
    expect(sql).toContain('n.tenant_id = 25 AND n.`user_id` = 0');
  });
});

describe('contournements du filtre cabinet', () => {
  const { injectTenantFilter, normalizeQualifiedTables, stripSqlComments, ForeignSchemaError } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./tenant-injection');
  const options = { tenantId: 7, tenantTables: new Set(['factures', 'dossiers']) };

  it('retire la base de l’application devant une table, qui redevient filtrée', () => {
    const sql = normalizeQualifiedTables('SELECT f.numero FROM kabysoft.factures f LIMIT 50', 'kabysoft');
    expect(sql).toBe('SELECT f.numero FROM factures f LIMIT 50');
    expect(injectTenantFilter(sql, options)).toContain('f.tenant_id = 7');
  });

  it('normalise aussi les listes FROM, les jointures et les backticks', () => {
    const sql = normalizeQualifiedTables(
      'SELECT 1 FROM `kabysoft`.`dossiers` d, kabysoft.factures f JOIN Kabysoft . factures g ON g.id = f.id',
      'kabysoft',
    );
    expect(sql).toBe('SELECT 1 FROM `dossiers` d, factures f JOIN factures g ON g.id = f.id');
  });

  it.each([
    'SELECT * FROM information_schema.tables',
    'SELECT * FROM factures f JOIN mysql.user u ON 1 = 1',
    'SELECT (SELECT COUNT(*) FROM autre_base.factures) AS n FROM dossiers d',
    'SELECT * FROM dossiers d, autre_base.factures f',
  ])('refuse une autre base : %s', (sql) => {
    expect(() => normalizeQualifiedTables(sql, 'kabysoft')).toThrow(ForeignSchemaError);
  });

  it('ne confond pas alias.colonne ni une chaîne avec une base', () => {
    const sql = "SELECT f.numero FROM factures f WHERE f.libelle = 'from mysql.user' LIMIT 5";
    expect(normalizeQualifiedTables(sql, 'kabysoft')).toBe(sql);
  });

  it('le filtre reconnaît une table qualifiée même sans normalisation', () => {
    expect(injectTenantFilter('SELECT f.numero FROM kabysoft.factures f LIMIT 50', options))
      .toContain('f.tenant_id = 7');
    expect(injectTenantFilter('SELECT 1 FROM dossiers d JOIN kabysoft.factures f ON f.dossier_id = d.id', options))
      .toContain('f.tenant_id = 7');
  });

  it('retire les commentaires, y compris exécutables, hors des chaînes', () => {
    expect(stripSqlComments('SELECT f.numero FROM/**/factures f')).toBe('SELECT f.numero FROM factures f');
    expect(stripSqlComments('SELECT 1 /*!50000 , (SELECT 1 FROM mysql.user) */ FROM factures f'))
      .toBe('SELECT 1   FROM factures f');
    expect(stripSqlComments("SELECT '--pas un commentaire /* */' AS t -- fin\nFROM factures f # autre"))
      .toBe("SELECT '--pas un commentaire /* */' AS t  \nFROM factures f  ");
    expect(stripSqlComments('SELECT 5--1 AS n')).toBe('SELECT 5--1 AS n');
    expect(injectTenantFilter(stripSqlComments('SELECT f.numero FROM/**/factures f'), options))
      .toContain('f.tenant_id = 7');
  });
});

describe('éléments supprimés (deleted_at)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { injectTenantFilter } = require('./tenant-injection');
  const options = {
    tenantId: 7,
    tenantTables: new Set(['factures', 'dossiers', 'paiements']),
    softDeleteTables: new Set(['factures', 'dossiers', 'paiements']),
  };

  it('exclut les lignes supprimées de la table principale et des jointures internes', () => {
    const sql = injectTenantFilter(
      "SELECT f.numero FROM factures f JOIN dossiers d ON d.id = f.dossier_id WHERE f.status <> '5' LIMIT 50",
      options,
    );
    expect(sql).toContain('f.deleted_at IS NULL');
    expect(sql).toContain('d.deleted_at IS NULL');
    expect(sql).toContain('f.tenant_id = 7');
  });

  it('met la condition dans le ON d’une jointure externe (la ligne principale reste)', () => {
    const sql = injectTenantFilter(
      'SELECT d.dossier_number, COUNT(f.id) AS n FROM dossiers d LEFT JOIN factures f ON f.dossier_id = d.id GROUP BY d.dossier_number LIMIT 50',
      options,
    );
    expect(sql).toContain('LEFT JOIN factures f ON (f.dossier_id = d.id) AND f.deleted_at IS NULL WHERE');
    expect(sql).toContain('GROUP BY d.dossier_number');
    expect(sql).toMatch(/WHERE [^]*d\.deleted_at IS NULL/);
    expect(sql).not.toMatch(/WHERE [^]*f\.deleted_at IS NULL/);
  });

  it('couvre les sous-requêtes corrélées (sommes de paiements)', () => {
    const sql = injectTenantFilter(
      "SELECT f.numero, (SELECT SUM(p.montant) FROM paiements p WHERE p.facture_id = f.id AND p.status = '1') AS paye FROM factures f LIMIT 50",
      options,
    );
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('f.deleted_at IS NULL');
  });

  it("s'applique aussi au cabinet 1, sans filtre cabinet", () => {
    const sql = injectTenantFilter('SELECT d.id FROM dossiers d LIMIT 5', { ...options, tenantId: 1 });
    expect(sql).toContain('d.deleted_at IS NULL');
    expect(sql).not.toContain('tenant_id');
  });

  it('ne double pas une condition déjà écrite et garde la casse des alias', () => {
    const sql = injectTenantFilter('SELECT F.numero FROM factures F WHERE F.deleted_at IS NULL LIMIT 5', options);
    expect(sql.match(/deleted_at IS NULL/g)).toHaveLength(1);
    expect(sql).toContain('F.tenant_id = 7');
  });

  it('jointure externe sans alias', () => {
    const sql = injectTenantFilter('SELECT d.id FROM dossiers d LEFT JOIN factures ON factures.dossier_id = d.id LIMIT 5', options);
    expect(sql).toContain('LEFT JOIN factures ON (factures.dossier_id = d.id) AND factures.deleted_at IS NULL WHERE');
  });
});
