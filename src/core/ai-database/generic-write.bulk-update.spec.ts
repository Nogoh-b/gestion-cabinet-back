/// <reference types="jest" />
import { FindOperator } from 'typeorm';
import { GenericWriteService } from './generic-write.service';
import { EntityIdRequiredException } from './write/entity-id-required.exception';

class Audience {}

// DOS-2026-0039 (dossier 94) : trois audiences « programmées » dont deux passées.
const audiences = [
  { id: 1, dossier_id: 94, status: 0 },
  { id: 2, dossier_id: 94, status: 0 },
  { id: 3, dossier_id: 94, status: 1 },
  { id: 4, dossier_id: 12, status: 0 },
];

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([k, v]) =>
    v instanceof FindOperator
      ? (v.value as any[]).map(String).includes(String(row[k]))
      : String(row[k]) === String(v),
  );
}

function createService() {
  const meta = {
    tableName: 'audiences',
    name: 'Audience',
    target: Audience,
    columns: ['id', 'dossier_id', 'status'].map((name) => ({ propertyName: name, databaseName: name })),
    manyToOneRelations: [],
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const dataSource: any = {
    entityMetadatas: [meta],
    createQueryRunner: () => queryRunner,
    getRepository: jest.fn(() => ({
      find: jest.fn(async ({ where = {}, take = 50 }: any) =>
        audiences.filter((row) => matches(row, where)).slice(0, take),
      ),
      count: jest.fn(async ({ where = {} }: any) => audiences.filter((row) => matches(row, where)).length),
    })),
  };
  const service: any = new GenericWriteService(dataSource, { getHandler: () => undefined } as any);
  service.assertReferencesInScope = jest.fn();
  service.executeOperation = jest.fn(async (op: any) => ({
    success: true,
    operation: op.operation,
    entityId: op.entityId,
    affected: 1,
    data: { id: op.entityId, status: 3 },
    message: 'ok',
  }));
  return service;
}

describe('Mise à jour groupée (all: true)', () => {
  it('applique la modification à chaque enregistrement correspondant', async () => {
    const service = createService();
    const results = await service.executePlan(
      {
        transaction: true,
        operations: [
          { operation: 'UPDATE', entity: 'audiences', match: { dossier_id: 94, status: 0 }, all: true, fields: { status: 3 } },
        ],
      },
      '1',
    );

    expect(service.executeOperation.mock.calls.map(([op]: any[]) => op.entityId)).toEqual([1, 2]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ entity: 'audiences', changedFields: ['status'] });
  });

  it('compte les correspondances pour la carte de confirmation', async () => {
    const service = createService();
    await expect(service.countMatches('audiences', { dossier_id: 94, status: 0 })).resolves.toBe(2);
  });

  it('ne vise jamais toute la table sans critère exploitable', async () => {
    const service = createService();
    const error = await service
      .executePlan(
        {
          transaction: true,
          operations: [{ operation: 'UPDATE', entity: 'audiences', match: { inconnue: 'x' }, all: true, fields: { status: 3 } }],
        },
        '1',
      )
      .catch((e: any) => e);

    expect(error).toBeInstanceOf(EntityIdRequiredException);
    expect(error.operationIndex).toBe(0);
    expect(service.executeOperation).not.toHaveBeenCalled();
  });
});
