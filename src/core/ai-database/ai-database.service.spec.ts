import { AiDatabaseService } from './ai-database.service';

describe('AiDatabaseService tenant SQL hardening', () => {
  let service: any;

  beforeEach(() => {
    service = Object.create(AiDatabaseService.prototype);
    service.dataSource = {
      entityMetadatas: [
        {
          tableName: 'dossiers',
          columns: [
            { propertyName: 'tenant_id', databaseName: 'tenant_id' },
          ],
          target: class Dossier {},
        },
      ],
    };
    service.logger = {
      debug: jest.fn(),
      warn: jest.fn(),
    };
    service._tenantTablesCache = null;
    service._sharedTenantTablesCache = null;
  });

  it('filtre aussi le tenant historique numero 1', () => {
    const sql = service.injectTenantConditions(
      'SELECT d.id FROM dossiers d',
      1,
    );

    expect(sql).toContain('d.tenant_id = 1');
  });

  it('isole une condition OR existante dans des parentheses', () => {
    const sql = service.injectTenantConditions(
      "SELECT d.id FROM dossiers d WHERE d.status = 'ACTIVE' OR 1 = 1",
      4,
    );

    expect(sql).toContain("(d.status = 'ACTIVE' OR 1 = 1)");
    expect(sql).toContain('(d.tenant_id = 4)');
  });
});
