/// <reference types="jest" />
import { FindOperator } from 'typeorm';
import { GenericWriteService, describeOperation } from './generic-write.service';
import { AmbiguityException } from './write/ambiguity.exception';

class Audience {}
class Dossier {}

const dossiers = [
  { id: 41, dossier_number: '2026-0421' },
  { id: 38, dossier_number: 'DOS-2026-0038' },
];
// Deux audiences du même jour, « programmées », dans deux dossiers différents.
const audiences = [
  { id: 11, dossier_id: 41, audience_date: '2026-10-15', audience_time: '09:30', status: 0 },
  { id: 26, dossier_id: 38, audience_date: '2026-10-15', audience_time: '09:00', status: 0 },
];

/** `find` simule MySQL : where simple ou tableau (OU), opérateur In compris. */
function matches(row: any, where: any): boolean {
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where).every(([k, v]) =>
    v instanceof FindOperator
      ? (v.value as any[]).map(String).includes(String(row[k]))
      : String(row[k]) === String(v),
  );
}

function createService() {
  const columns = (names: string[]) =>
    names.map((name) => ({ propertyName: name, databaseName: name }));
  const dossierMeta = {
    tableName: 'dossiers',
    name: 'Dossier',
    target: Dossier,
    columns: columns(['id', 'dossier_number']),
  };
  const audienceMeta = {
    tableName: 'audiences',
    name: 'Audience',
    target: Audience,
    columns: columns(['id', 'dossier_id', 'audience_date', 'audience_time', 'status']),
    manyToOneRelations: [
      {
        propertyName: 'dossier',
        joinColumns: [{ databaseName: 'dossier_id' }],
        inverseEntityMetadata: dossierMeta,
      },
    ],
  };
  const tables = new Map<any, any[]>([
    [Audience, audiences],
    [Dossier, dossiers],
  ]);
  const dataSource: any = {
    entityMetadatas: [audienceMeta, dossierMeta],
    getRepository: jest.fn((target: any) => ({
      find: jest.fn(async ({ where = {}, take = 50 }: any) =>
        (tables.get(target) ?? []).filter((row) => matches(row, where)).slice(0, take),
      ),
      count: jest.fn(async ({ where = {} }: any) =>
        (tables.get(target) ?? []).filter((row) => matches(row, where)).length,
      ),
    })),
  };
  return new GenericWriteService(dataSource, {} as any) as any;
}

describe('Ciblage d’un UPDATE par une entité liée', () => {
  it('traduit le numéro de dossier pour distinguer deux audiences du même jour', async () => {
    const service = createService();

    await expect(
      service.resolveUpdateTarget('audiences', {
        dossier: '2026-0421',
        audience_date: '2026-10-15',
        status: 0,
      }),
    ).resolves.toBe(11);
  });

  it('écarte une audience déjà visée par une opération précédente du plan', async () => {
    const service = createService();

    await expect(
      service.resolveUpdateTarget(
        'audiences',
        { audience_date: '2026-10-15', status: 0 },
        new Set(['audiences:11']),
      ),
    ).resolves.toBe(26);
  });

  it('montre le dossier et l’heure des candidats quand il faut choisir', async () => {
    const service = createService();
    const error = await service
      .resolveUpdateTarget('audiences', { audience_date: '2026-10-15', status: 0 })
      .catch((e: any) => e);

    expect(error).toBeInstanceOf(AmbiguityException);
    const labels = error.candidates.map((c: any) => c.label).join('\n');
    expect(labels).toContain('dossier: 2026-0421');
    expect(labels).toContain('audience_time: 09:30');
    expect(labels).toContain('dossier: DOS-2026-0038');
  });
});

describe('Progression d’un plan', () => {
  it('décrit chaque opération lisiblement', () => {
    expect(
      describeOperation({ operation: 'UPDATE', entity: 'audiences', entityId: 26, fields: {} } as any),
    ).toBe('Mise à jour · audiences #26');
    expect(
      describeOperation({
        operation: 'INSERT',
        entity: 'dossiers',
        fields: {},
        humanReadable: 'Créer le dossier Dupont',
      } as any),
    ).toBe('Créer le dossier Dupont');
  });
});
