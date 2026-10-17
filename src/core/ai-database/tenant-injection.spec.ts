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

  it("ne réinjecte rien quand le filtre est déjà dans la clause ON", () => {
    const service = serviceWithTables(['dossiers', 'jurisdictions']);
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d LEFT JOIN jurisdictions j ON j.id = d.jurisdiction_id AND j.tenant_id = 25 WHERE d.tenant_id = 25',
      25,
    );
    expect(sql).not.toContain('IS NULL');
  });
});
