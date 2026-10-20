import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { GenericWriteService } from './generic-write.service';

/**
 * Choix « Créer « X » » de la carte de confirmation (`{ $create: "X" }`) :
 * l'exécution crée la valeur telle quelle, sans refaire de recherche.
 */

class ProcedureType {}
class Dossier {}

const procedureMeta: any = { tableName: 'procedure_types', target: ProcedureType, relations: [], deleteDateColumn: {}, primaryColumns: [{ propertyName: 'id' }] };
const relation = (propertyName: string, fkColumn: string) => ({
  relationType: 'many-to-one',
  propertyName,
  inverseEntityMetadata: procedureMeta,
  joinColumns: [{ databaseName: fkColumn, propertyName: fkColumn }],
});
const dossierMeta: any = {
  tableName: 'dossiers',
  target: Dossier,
  deleteDateColumn: {},
  relations: [relation('procedure_type', 'procedure_type_id'), relation('procedure_subtype', 'procedure_subtype_id')],
};

function setup({ failDossier = false } = {}) {
  let nextId = 730;
  const procedureHandler = {
    entityName: 'procedure_types',
    execute: jest.fn(async (intent: any) => {
      const id = ++nextId;
      return { success: true, operation: 'INSERT', entityId: id, affected: 1, data: { id, ...intent.fields }, message: 'Type créé' };
    }),
  };
  let dossierId = 100;
  const dossierHandler = {
    entityName: 'dossiers',
    execute: jest.fn(async (intent: any) => {
      if (failDossier) throw new BadRequestException('Client introuvable');
      const id = ++dossierId;
      return { success: true, operation: 'INSERT', entityId: id, affected: 1, data: { id, ...intent.fields }, message: 'Dossier créé' };
    }),
  };
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { softDelete: jest.fn(), delete: jest.fn() },
  };
  const dataSource: any = {
    entityMetadatas: [procedureMeta, dossierMeta],
    createQueryRunner: jest.fn(() => runner),
    // Identifiants reçus avec le plan : visibles par le cabinet.
    getRepository: jest.fn(() => ({ count: jest.fn(async () => 1) })),
  };
  const handlers: Record<string, any> = { procedure_types: procedureHandler, dossiers: dossierHandler };
  const resolver: any = {
    creationFieldsFromText: jest.fn((_table: string, text: string) => ({ name: text })),
    resolveAnyEntity: jest.fn(async () => ({ found: false, best: null, candidates: [], ambiguous: false })),
  };
  const permissions: any = { assertCanWritePlan: jest.fn(async () => undefined) };
  const service = new GenericWriteService(dataSource, { getHandler: (name: string) => handlers[name] } as any, undefined, resolver, permissions);
  return { service, procedureHandler, dossierHandler, runner, resolver, permissions };
}

const dossierOp = (fields: Record<string, any>) => ({ operation: 'INSERT', entity: 'dossiers', fields: { object: 'X', ...fields }, humanReadable: '' });
const plan = (...operations: any[]) => ({ transaction: true, confidence: 1, humanReadable: '', operations });

describe('Choix « Créer » de la carte de confirmation', () => {
  it('crée le type puis le sous-type rattaché, une seule fois pour tous les dossiers du plan', async () => {
    const { service, procedureHandler, dossierHandler, resolver } = setup();
    const choice = { procedure_type: { $create: 'Contentieux civil' }, procedure_subtype: { $create: 'Licenciement abusif' } };

    const results = await service.executePlan(plan(dossierOp(choice), dossierOp(choice)) as any, '7');

    // Aucune nouvelle recherche : la décision de la carte est appliquée.
    expect(resolver.resolveAnyEntity).not.toHaveBeenCalled();
    expect(procedureHandler.execute).toHaveBeenCalledTimes(2);
    expect((procedureHandler.execute.mock.calls[0][0] as any).fields).toEqual({ name: 'Contentieux civil', is_subtype: false, hierarchy_level: 1 });
    expect((procedureHandler.execute.mock.calls[1][0] as any).fields).toEqual({ name: 'Licenciement abusif', is_subtype: true, hierarchy_level: 2, parent_id: 731 });
    for (const call of dossierHandler.execute.mock.calls) {
      expect((call[0] as any).fields).toEqual({ object: 'X', procedure_type_id: 731, procedure_subtype_id: 732 });
    }
    // Les créations figurent au compte rendu de la première opération.
    expect(results[0].cascadeCreations?.map((c) => c.searchTerm)).toEqual(['Contentieux civil', 'Licenciement abusif']);
    expect(results[1].cascadeCreations).toBeUndefined();
  });

  it('crée le sous-type sous le type déjà choisi (identifiant)', async () => {
    const { service, procedureHandler } = setup();
    await service.executePlan(plan(dossierOp({ procedure_type_id: 6, procedure_subtype: { $create: 'Accident de circulation' } })) as any, '7');
    expect((procedureHandler.execute.mock.calls[0][0] as any).fields).toMatchObject({ is_subtype: true, parent_id: 6 });
  });

  it('refuse un sous-type sans type connu au lieu d’en faire un type principal', async () => {
    const { service, procedureHandler } = setup();
    await expect(
      service.executePlan(plan(dossierOp({ procedure_type: 'Inconnu', procedure_subtype: { $create: 'Licenciement abusif' } })) as any, '7'),
    ).rejects.toThrow('Impossible de créer « Licenciement abusif » : choisissez d’abord son type de procédure.');
    expect(procedureHandler.execute).not.toHaveBeenCalled();
  });

  it('vérifie le droit de créer dans la table référencée', async () => {
    const { service, permissions, procedureHandler } = setup();
    permissions.assertCanWritePlan.mockRejectedValueOnce(new Error('Accès non autorisé') as never);
    await expect(service.executePlan(plan(dossierOp({ procedure_type: { $create: 'Social' } })) as any, '7')).rejects.toThrow('Accès non autorisé');
    expect(permissions.assertCanWritePlan.mock.calls[0][1]).toMatchObject({ operations: [{ operation: 'INSERT', entity: 'procedure_types' }] });
    expect(procedureHandler.execute).not.toHaveBeenCalled();
  });

  it('annule les valeurs créées si le plan échoue ensuite', async () => {
    const { service, runner } = setup({ failDossier: true });
    await expect(service.executePlan(plan(dossierOp({ procedure_type: { $create: 'Social' } })) as any, '7')).rejects.toThrow('Client introuvable');
    expect(runner.manager.delete).toHaveBeenCalledWith(ProcedureType, '731');
  });
});
