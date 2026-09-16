import { describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';

import { BusinessTable } from '../decorators/business-metadata.decorator';
import { SchemaMetadataService } from './schema-metadata.service';

@BusinessTable({
  label: 'Anciennes étapes',
  description: 'Table legacy',
  category: 'procedure',
})
class LegacyStage {}

@BusinessTable({
  label: 'Actions des dossiers',
  description: 'Traitement courant',
  category: 'traitement',
  readOnly: true,
})
class CurrentAction {}

describe('SchemaMetadataService', () => {
  it('ne charge pas une table exclue par la configuration projet', async () => {
    const dataSource = {
      entityMetadatas: [
        { tableName: 'stages', target: LegacyStage, columns: [] },
        { tableName: 'dossier_actions', target: CurrentAction, columns: [] },
      ],
    } as unknown as DataSource;
    const service = new SchemaMetadataService(dataSource, {
      databaseTablesConfig: { ignoredTables: ['STAGES'] },
    });

    await service.initializeMetadata();

    expect(service.getAllVisibleTables()).toEqual(['dossier_actions']);
    expect(service.isTableIgnored('stages')).toBe(true);
    expect(service.hasTableMetadata('stages')).toBe(false);
  });

  it('retire les identifiants techniques des résultats destinés au chat', () => {
    const service = new SchemaMetadataService(
      { entityMetadatas: [] } as unknown as DataSource,
    );

    expect(
      service.transformRowToBusiness(
        {
          id: 'ba5fa041-b601-4c11-8500-365b95d20ecb',
          definition_id: '2565e267-a8d1-4b57-a5ea-15d487dce337',
          responsible_user_id: 32,
          responsable: 'Amina Nguema',
          title: 'Saisir une juridiction',
          dossier_number: 'DOS-2026-0042',
        },
        'dossier_actions',
      ),
    ).toEqual({
      Responsable: 'Amina Nguema',
      Title: 'Saisir une juridiction',
      'Dossier Number': 'DOS-2026-0042',
    });
  });
});
