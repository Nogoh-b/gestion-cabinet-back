import { describe, expect, it, jest } from '@jest/globals';
import { GenericWriteService } from './generic-write.service';

function createService(handlers: Record<string, any>) {
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { softDelete: jest.fn(), delete: jest.fn() },
  };
  const dataSource: any = { entityMetadatas: [], createQueryRunner: jest.fn(() => runner) };
  const registry: any = { getHandler: (name: string) => handlers[name] };
  return new GenericWriteService(dataSource, registry);
}

describe('GenericWriteService — liens entre opérations du plan', () => {
  it('résout {{tempId.id}} dans les listes et transmet les créations du plan', async () => {
    const audienceHandler = {
      execute: jest.fn(async () => ({
        success: true,
        operation: 'INSERT',
        entityId: 77,
        affected: 1,
        data: { id: 77, dossier_id: '91' },
      })),
    };
    let next = 0;
    const actionHandler = {
      execute: jest.fn(async () => {
        next += 1;
        return {
          success: true,
          operation: 'INSERT',
          entityId: `act-${next}`,
          affected: 1,
          data: { id: `act-${next}`, dossier_id: 91 },
        };
      }),
    };
    const service = createService({
      audiences: audienceHandler,
      dossier_actions: actionHandler,
    });

    await service.executePlan(
      {
        transaction: true,
        confidence: 1,
        humanReadable: '',
        operations: [
          { operation: 'INSERT', entity: 'audiences', tempId: 'aud1', fields: { dossier_id: 91 } },
          {
            operation: 'INSERT',
            entity: 'dossier_actions',
            tempId: 'act1',
            fields: {
              dossier_id: 91,
              audiences: ['{{aud1.id}}'],
              specific_data: { audience: { id: '{{aud1.id}}' } },
            },
          },
          {
            operation: 'INSERT',
            entity: 'dossier_actions',
            fields: { dossier_id: 91, previous_actions: [{ id: '{{act1.id}}' }] },
          },
        ],
      } as any,
      '5',
    );

    const [first, second] = actionHandler.execute.mock.calls.map((call: any[]) => call[0]);
    expect(first.fields.audiences).toEqual(['77']);
    expect(first.fields.specific_data).toEqual({ audience: { id: '77' } });
    expect(first.planCreated.map((r: any) => [r.entity, r.id])).toEqual([['audiences', 77]]);

    expect(second.fields.previous_actions).toEqual([{ id: 'act-1' }]);
    expect(second.planCreated.map((r: any) => [r.entity, r.id])).toEqual([
      ['audiences', 77],
      ['dossier_actions', 'act-1'],
    ]);
  });
});
