/// <reference types="jest" />
import { AiDatabaseService } from './ai-database.service';
import { DATABASE_TABLES_CONFIG } from '../../config/ai-database/database-tables.config';

const billingTables = [
  'billable_items', 'dossier_billing_profiles', 'dossier_billing_rules',
  'case_action_definitions',
];
const visibleTables = [
  'dossiers', 'customer', 'dossier_actions', 'dossier_recommendations',
  'case_action_families', ...billingTables,
];

function createService(tables = visibleTables) {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.schemaMetadata = {
    hasTableMetadata: (table: string) => tables.includes(table),
    getAllVisibleTables: () => tables,
    getTableMetadataForPrompt: () => ({}),
  };
  service.projectConfig = { databaseTablesConfig: DATABASE_TABLES_CONFIG };
  service.tableDetectionCache = new Map();
  service.relationshipsCache = new Map();
  service.logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn() };
  service.markMetric = jest.fn();
  return service;
}

describe('Contexte de lecture IA de la facturation', () => {
  it.each(['dossier', 'case', 'action'])(
    'conserve les tarifs du dossier pour une question de suivi avec une reference %s',
    async (type) => {
      const service = createService();
      const tables = await service.detectRelevantTables('Et le montant exact ?', undefined, [{ type, id: 90 }]);
      expect(tables).toEqual(expect.arrayContaining(billingTables));
      expect(tables).toContain('dossier_actions');
    },
  );

  it('retrouve profil, regles et elements pour une vacation sans reference explicite', async () => {
    const tables = await createService().detectRelevantTables('Quel est le tarif de vacation ?');
    expect(tables).toEqual(expect.arrayContaining([
      'billable_items', 'dossier_billing_profiles', 'dossier_billing_rules',
    ]));
  });

  it('ne rajoute pas de profil dont les metadonnees sont indisponibles', async () => {
    const service = createService(visibleTables.filter((table) => table !== 'dossier_billing_profiles'));
    const tables = await service.detectRelevantTables('Et le montant exact ?', undefined, [{ type: 'dossier', id: 90 }]);
    expect(tables).not.toContain('dossier_billing_profiles');
    expect(tables).toContain('billable_items');
  });
});
