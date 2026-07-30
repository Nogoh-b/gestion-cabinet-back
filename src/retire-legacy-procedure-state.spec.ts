import { getMetadataArgsStorage } from 'typeorm';
import {
  legacyObject,
  legacyStringList,
  parseLegacyJson,
  selectUnambiguousVisit,
} from './migrations/1785169045000-MigrateLegacyProcedureInstanceState';
import { RetireLegacyProcedureInstanceState1785169046000 } from './migrations/1785169046000-RetireLegacyProcedureInstanceState';
import { HistoryEntry } from './modules/procedure/entities/history-entry.entity';
import { ProcedureInstance } from './modules/procedure/entities/procedure-instance.entity';
import { StageVisit } from './modules/procedure/entities/stage-visit.entity';
import { ProcedureInstanceService } from './modules/procedure/services/procedure-instance.service';

function declaredColumns(
  target: typeof ProcedureInstance | typeof StageVisit | typeof HistoryEntry,
): string[] {
  return getMetadataArgsStorage()
    .columns.filter((column) => column.target === target)
    .map((column) => column.propertyName);
}

describe('retrait des états procéduraux historiques', () => {
  it('normalise les charges JSON historiques sans inventer de valeur', () => {
    expect(parseLegacyJson('["sub-1","sub-2"]')).toEqual([
      'sub-1',
      'sub-2',
    ]);
    expect(parseLegacyJson('invalide')).toBeNull();
    expect(legacyStringList(['sub-1', 'sub-1', '', 42])).toEqual([
      'sub-1',
    ]);
    expect(legacyObject('{"sub-1":{"note":"preuve"}}')).toEqual({
      'sub-1': { note: 'preuve' },
    });
    expect(legacyObject('[]')).toEqual({});
  });

  it('n’affecte une reprise d’instance qu’à une visite non ambiguë', () => {
    const visits = [{ id: 'visit-1' }, { id: 'visit-2' }];

    expect(selectUnambiguousVisit(visits, ['visit-2'])).toBe('visit-2');
    expect(selectUnambiguousVisit(visits, [])).toBeNull();
    expect(
      selectUnambiguousVisit(visits, ['visit-1', 'visit-2']),
    ).toBeNull();
    expect(selectUnambiguousVisit([{ id: 'visit-1' }], [])).toBe(
      'visit-1',
    );
  });

  it('retire les colonnes TypeORM parallèles et compte les cycles par historique', () => {
    expect(declaredColumns(ProcedureInstance)).not.toEqual(
      expect.arrayContaining([
        'completedSubStages',
        'cycleUsageCount',
        'subStageMetadata',
      ]),
    );
    expect(declaredColumns(StageVisit)).not.toEqual(
      expect.arrayContaining(['completedSubStages', 'subStageMetadata']),
    );
    expect(declaredColumns(HistoryEntry)).toContain('cycleId');
  });

  it('calcule les usages de cycle depuis l’historique append-only', async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { cycleId: 'cycle-1', usageCount: '2' },
        { cycleId: 'cycle-2', usageCount: '1' },
      ]),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(builder),
      }),
    };

    const counts = await (
      ProcedureInstanceService.prototype as any
    ).getCycleUsageCounts.call({}, manager, 'instance-1', [
      'cycle-1',
      'cycle-2',
    ]);

    expect(counts).toEqual({ 'cycle-1': 2, 'cycle-2': 1 });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'history.cycleId IN (:...cycleIds)',
      { cycleIds: ['cycle-1', 'cycle-2'] },
    );
  });

  it('bloque la suppression si une anomalie de reprise reste ouverte', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValueOnce([{ total: 1 }]),
    };
    const migration =
      new RetireLegacyProcedureInstanceState1785169046000();

    await expect(migration.up(queryRunner as any)).rejects.toThrow(
      /procedure_legacy_migration_issues/,
    );
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('ne supprime les colonnes qu’après archivage et rapprochement', async () => {
    const queryRunner = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValue([]),
    };
    const migration =
      new RetireLegacyProcedureInstanceState1785169046000();

    await migration.up(queryRunner as any);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement).replace(/\s+/g, ' ').trim())
      .join('\n');
    expect(sql).toContain(
      'ADD UNIQUE KEY uq_sub_stage_visit_per_stage_visit',
    );
    expect(sql).toContain('ALTER TABLE stage_visits DROP COLUMN completedSubStages');
    expect(sql).toContain(
      'ALTER TABLE procedure_instances DROP COLUMN completedSubStages, DROP COLUMN cycleUsageCount, DROP COLUMN subStageMetadata',
    );
  });
});
