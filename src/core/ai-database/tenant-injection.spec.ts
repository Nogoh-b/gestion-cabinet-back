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
    const service = serviceWithTables(['dossiers', 'audience_types'], ['audience_types']);
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
    const service = serviceWithTables(['dossiers', 'customer', 'dossier_actions', 'audiences', 'user']);
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
    const mainWhere = sql.split('\n').find((line: string) => line.startsWith('WHERE'));
    expect(mainWhere).not.toMatch(/\b(?:da|a)\.tenant_id/);
  });

  it('ajoute le WHERE avant le LIMIT principal, pas avant celui d’une sous-requête', () => {
    const service = serviceWithTables(['dossiers', 'audiences']);
    const sql = service.injectTenantConditions(
      'SELECT d.id, (SELECT a.audience_date FROM audiences a WHERE a.dossier_id = d.id ORDER BY a.audience_date LIMIT 1) AS prochaine FROM dossiers d ORDER BY d.id LIMIT 50',
      25,
    );
    expect(sql).toContain('WHERE (a.dossier_id = d.id) AND (a.tenant_id = 25)\nORDER BY a.audience_date LIMIT 1)');
    expect(sql).toContain('FROM dossiers d WHERE d.tenant_id = 25\nORDER BY d.id LIMIT 50');
  });

  it('filtre chaque branche d’une UNION et ignore les mots entre guillemets', () => {
    const service = serviceWithTables(['dossiers', 'factures']);
    const sql = service.injectTenantConditions(
      "SELECT d.id FROM dossiers d WHERE d.object = 'appel (WHERE x' UNION ALL SELECT f.id FROM factures f",
      25,
    );
    expect(sql).toContain("WHERE (d.object = 'appel (WHERE x') AND (d.tenant_id = 25) UNION ALL");
    expect(sql).toMatch(/FROM factures f WHERE f\.tenant_id = 25$/);
  });

  it("ne réinjecte rien quand le filtre est déjà dans la clause ON", () => {
    const service = serviceWithTables(['dossiers', 'jurisdictions']);
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d LEFT JOIN jurisdictions j ON j.id = d.jurisdiction_id AND j.tenant_id = 25 WHERE d.tenant_id = 25',
      25,
    );
    expect(sql).not.toContain('IS NULL');
  });
});
