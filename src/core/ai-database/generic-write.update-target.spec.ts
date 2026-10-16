/// <reference types="jest" />
import { GenericWriteService } from './generic-write.service';
import { AmbiguityException, UPDATE_TARGET_FIELD } from './write/ambiguity.exception';

class PayrollPeriod {}

/** `find` simule MySQL : filtre les lignes sur chaque critère du where. */
function createService(table: any[]) {
  const find = jest.fn(async ({ where = {}, take = 50 }: any) =>
    table
      .filter((row) => Object.entries(where).every(([k, v]) => String(row[k]) === String(v)))
      .slice(0, take),
  );
  const dataSource: any = {
    entityMetadatas: [
      {
        tableName: 'payroll_period',
        name: 'PayrollPeriod',
        target: PayrollPeriod,
        columns: ['id', 'label', 'start_date', 'end_date', 'status'].map((name) => ({
          propertyName: name,
          databaseName: name,
        })),
      },
    ],
    getRepository: jest.fn(() => ({ find })),
  };
  const service: any = new GenericWriteService(dataSource, {} as any);
  return { service, find };
}

const periods = [
  { id: 9, label: 'Juin 2023', start_date: '2026-09-30', end_date: '2026-10-30', status: 'draft' },
  { id: 6, label: 'ff', start_date: '2026-08-31', end_date: '2026-09-29', status: 'draft' },
  { id: 7, label: 'fdf', start_date: '2026-08-31', end_date: '2026-09-29', status: 'validated' },
];

describe('Résolution de la cible d’un UPDATE sans identifiant', () => {
  it('retrouve l’identifiant quand une seule période correspond, dates françaises comprises', async () => {
    const { service } = createService(periods);
    await expect(
      service.resolveUpdateTarget('payroll_period', { start_date: '30/09/2026', end_date: '30/10/2026' }),
    ).resolves.toBe(9);
  });

  it('fait choisir parmi les correspondances exactes (doublon sur les mêmes dates)', async () => {
    const { service } = createService(periods);
    const error = await service
      .resolveUpdateTarget('payroll_period', { start_date: '2026-08-31', end_date: '2026-09-29' })
      .catch((e: any) => e);
    expect(error).toBeInstanceOf(AmbiguityException);
    expect(error.fieldName).toBe(UPDATE_TARGET_FIELD);
    expect(error.candidates.map((c: any) => c.id).sort()).toEqual([6, 7]);
    expect(error.candidates[0].label).toContain('label:');
  });

  it('propose les plus proches quand rien ne correspond exactement (date décalée d’un jour)', async () => {
    const { service } = createService(periods);
    const error = await service
      .resolveUpdateTarget('payroll_period', { start_date: '2026-09-29', end_date: '2026-10-30' })
      .catch((e: any) => e);
    expect(error).toBeInstanceOf(AmbiguityException);
    expect(error.candidates[0]).toMatchObject({ id: 9, score: 50 });
  });

  it('propose les plus récents plutôt que bloquer quand aucun critère ne correspond', async () => {
    const { service } = createService(periods);
    const error = await service
      .resolveUpdateTarget('payroll_period', { label: 'inexistante' })
      .catch((e: any) => e);
    expect(error).toBeInstanceOf(AmbiguityException);
    expect(error.candidates.every((c: any) => c.score === 0)).toBe(true);
    expect(error.candidates).toHaveLength(3);
  });

  it('ignore les colonnes inconnues et l’id inventé', async () => {
    const { service, find } = createService(periods);
    await service.resolveUpdateTarget('payroll_period', { inconnue: 'x', id: 3 }).catch(() => undefined);
    for (const [args] of find.mock.calls as any[]) {
      expect(args.where).not.toHaveProperty('inconnue');
      expect(args.where).not.toHaveProperty('id');
    }
  });
});
