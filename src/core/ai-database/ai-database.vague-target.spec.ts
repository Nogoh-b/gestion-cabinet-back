/// <reference types="jest" />
import { AiDatabaseService } from './ai-database.service';

/**
 * Demande de modification dont la cible ne tient que par la page ouverte :
 * l'assistant pose la question avec de vraies pistes au lieu de deviner.
 */
const TABLES: Record<string, { label: string; columns: string[]; rows: Array<Record<string, any>> }> = {
  document_customer: {
    label: 'Documents clients',
    columns: ['id', 'name', 'deleted_at'],
    rows: [{ id: 37, name: 'Contrat' }, { id: 36, name: 'Doc' }],
  },
  pdf_templates: {
    label: 'Modèles de documents PDF',
    columns: ['id', 'code', 'name', 'deleted_at'],
    rows: [{ id: 2, code: 'dossier_synthese', name: 'Synthèse dossier' }, { id: 1, code: 'facture_standard', name: 'Facture standard' }],
  },
  mail_templates: {
    label: 'Modèles de mails',
    columns: ['id', 'code', 'name', 'deleted_at'],
    rows: [{ id: 5, code: 'dossier_created_client', name: 'Dossier créé' }],
  },
};

function serviceOf(): any {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.logger = { warn: jest.fn(), log: jest.fn() };
  service.lastDisplayedRecords = new Map();
  service.getUserId = () => '31';
  service.dataSource = {
    entityMetadatas: Object.entries(TABLES).map(([tableName, table]) => ({
      tableName,
      columns: table.columns.map((name) => ({ propertyName: name, databaseName: name })),
    })),
    query: jest.fn(async (sql: string, params: any[]) => {
      const table = /FROM `(\w+)`/.exec(sql)![1];
      const rows = TABLES[table].rows;
      return /WHERE.*\bid = \?/.test(sql) ? rows.filter((row) => String(row.id) === String(params[0])) : rows;
    }),
  };
  service.schemaMetadata = {
    getAllVisibleTables: () => Object.keys(TABLES),
    getTableLabel: (name: string) => TABLES[name]?.label ?? name,
  };
  service.aiPermissionService = {
    partitionReadableTables: jest.fn(async (_user: unknown, tables: string[]) => ({ allowed: tables, denied: [] })),
  };
  return service;
}

const pageDocument = [{ type: 'document', id: 36, label: 'Doc', source: 'page', data: { id: 36 } }];
const plan = (fields: Record<string, any>) => ({
  transaction: true,
  humanReadable: '',
  confidence: 0.9,
  operations: [{ operation: 'UPDATE', entity: 'document_customer', entityId: 36, fields }],
});

describe('AiDatabaseService.clarifyVagueTargets', () => {
  it('« un modèle de document » sur la page du document #36 : pose la question avec de vraies pistes', async () => {
    const service = serviceOf();
    const result = await service.clarifyVagueTargets(
      plan({ name: 'Doc' }),
      { id: 31 },
      'je veux modifier un modèle de document',
      [],
      pageDocument,
    );
    expect(result).not.toBeNull();
    expect(result.intentMode).toBe('write');
    const labels: string[] = result.options.map((option: any) => option.label);
    // La fiche de la page est proposée, mais aussi les modèles évoqués par la demande.
    expect(labels[0]).toContain('Documents clients');
    expect(labels.some((label) => label.includes('Modèles de documents PDF') && label.includes('facture_standard'))).toBe(true);
    expect(labels.some((label) => label.includes('Modèles de mails'))).toBe(true);
    // Chaque piste porte son numéro : la réponse désigne la cible sans équivoque.
    for (const option of result.options) expect(option.followUpQuestion).toMatch(/n°\d+/);
  });

  it('un vrai changement donné avec la demande reste exécutable', async () => {
    const service = serviceOf();
    const result = await service.clarifyVagueTargets(plan({ name: 'Nouveau nom' }), { id: 31 }, 'renomme en Nouveau nom', [], pageDocument);
    expect(result).toBeNull();
  });

  it('« ce document » vise la page : aucune question', async () => {
    const service = serviceOf();
    const result = await service.clarifyVagueTargets(plan({}), { id: 31 }, 'modifie ce document', [], pageDocument);
    expect(result).toBeNull();
  });

  it('une cible mentionnée par l’utilisateur n’est pas une devinette', async () => {
    const service = serviceOf();
    const mentioned = [{ type: 'document', id: 36, label: 'Doc', source: 'mention', data: { id: 36 } }];
    const result = await service.clarifyVagueTargets(plan({}), { id: 31 }, 'je veux modifier un document', [], mentioned);
    expect(result).toBeNull();
  });

  it('sans fiche de page, rien à vérifier', async () => {
    const service = serviceOf();
    expect(await service.clarifyVagueTargets(plan({}), { id: 31 }, 'je veux modifier un document', [], [])).toBeNull();
  });
});
