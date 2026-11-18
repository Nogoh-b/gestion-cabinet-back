/// <reference types="jest" />
/**
 * Une requête de lecture qui échoue ne doit jamais être présentée comme une
 * absence de données, et le correcteur doit recevoir la vraie erreur de la base.
 */
import {
  AiDatabaseService,
  FAILED_READ_SQL,
  isFailedReadQuery,
} from './ai-database.service';

function serviceWith(query: jest.Mock) {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  service.dataSource = { options: { database: 'kabysoft' }, entityMetadatas: [], query };
  service._tenantTablesCache = new Set<string>();
  service._sharedTenantTablesCache = new Set<string>();
  service._softDeleteTablesCache = new Set<string>();
  return service;
}

describe('échec de lecture ≠ aucun résultat', () => {
  it('distingue le marqueur d’échec de la requête « rien à chercher »', () => {
    const service = serviceWith(jest.fn());
    expect(isFailedReadQuery(FAILED_READ_SQL)).toBe(true);
    expect(isFailedReadQuery('SELECT NULL AS message WHERE 1=0')).toBe(false);
    // Les deux restent des requêtes vides pour les flux existants.
    expect(service.isSyntheticEmptyQuery(FAILED_READ_SQL)).toBe(true);
    expect(service.isSyntheticEmptyQuery('SELECT NULL AS message WHERE 1=0')).toBe(true);
  });

  it('transmet la vraie erreur de la base au correcteur', async () => {
    const query = jest.fn().mockRejectedValue({ sqlMessage: "Unknown column 'f.statut' in 'field list'" });
    const service = serviceWith(query);

    const result = await service.validateQuery('SELECT f.statut FROM factures f LIMIT 5');

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown column 'f.statut'");
  });

  it('renvoie le marqueur d’échec quand la requête reste invalide après corrections', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue({ sqlMessage: 'Table kabysoft.facturez doesn\'t exist' }));
    const prompts: string[] = [];
    service.buildReadDomainRulesBlock = () => '';
    service.invokeModel = jest.fn(async (_profile: string, prompt: string) => {
      prompts.push(prompt);
      return { content: '```sql\nSELECT * FROM facturez LIMIT 5\n```' };
    });

    const sql = await service.validateAndFixQuery('SELECT * FROM facturez LIMIT 5', ['factures'], 'schema', 'mes factures');

    expect(sql).toBe(FAILED_READ_SQL);
    expect(prompts[0]).toContain("facturez doesn't exist");
  });
});
