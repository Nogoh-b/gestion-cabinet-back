import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { Ecriture } from '../entities/ecriture.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import {
  SourceModule,
  StatutEcriture,
  StatutExercice,
  TypeJournal,
} from '../enums/comptabilite.enums';
import { EcrituresService } from './ecritures.service';

describe('EcrituresService - cycle DRAFT/POSTED/REVERSED', () => {
  const ecritureRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const exerciceRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === Ecriture ? ecritureRepository : exerciceRepository,
    ),
    query: jest.fn(async (sql: string) =>
      sql.includes('SELECT next_value') ? [{ next_value: 4 }] : {},
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-accounting-1' })),
  };
  let service: EcrituresService;

  beforeEach(() => {
    jest.clearAllMocks();
    ecritureRepository.create.mockImplementation((value) => value);
    ecritureRepository.save.mockImplementation(async (value) => value);
    manager.query.mockImplementation(async (sql: string) =>
      sql.includes('SELECT next_value') ? [{ next_value: 4 }] : {},
    );
    service = new EcrituresService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      audit as any,
    );
  });

  it('poste et verrouille une écriture brouillon équilibrée', async () => {
    const draft = {
      id: 10,
      status: StatutEcriture.DRAFT,
      isLocked: false,
      exercice: { annee: 2026, statut: StatutExercice.OUVERT },
      lignes: [
        { debit: 125.5, credit: 0 },
        { debit: 0, credit: 125.5 },
      ],
    };
    ecritureRepository.findOne.mockResolvedValue(draft);

    const result = await runWithTenantContext(2, () => service.poster(10));

    expect(result.status).toBe(StatutEcriture.POSTED);
    expect(result.isLocked).toBe(true);
    expect(result.postedAt).toBeInstanceOf(Date);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'accounting.entry.posted',
        resourceId: 10,
      }),
    );
  });

  it('crée une contrepassation atomique et inverse exactement les lignes', async () => {
    const original: any = {
      id: 11,
      numero: 'BANQUE-2026-00003',
      status: StatutEcriture.POSTED,
      journal_id: 4,
      journal: { id: 4, code: 'BQ', typeJournal: TypeJournal.BANQUE },
      exercice: { id: 1, annee: 2026, statut: StatutExercice.OUVERT },
      libelle: 'Encaissement',
      lignes: [
        { compte_id: 1, debit: 90, credit: 0, libelle: 'Banque' },
        { compte_id: 2, debit: 0, credit: 90, libelle: 'Client' },
      ],
    };
    ecritureRepository.findOne
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(null);
    exerciceRepository.findOne.mockResolvedValue({
      id: 2,
      annee: new Date().getUTCFullYear(),
      statut: StatutExercice.OUVERT,
    });

    const result: any = await runWithTenantContext(2, () =>
      service.contrepasser(
        11,
        'Correction d’une imputation comptable erronée',
      ),
    );

    expect(result.reversalOfId).toBe(11);
    expect(result.status).toBe(StatutEcriture.POSTED);
    expect(result.lignes).toEqual([
      expect.objectContaining({ compte_id: 1, debit: 0, credit: 90 }),
      expect.objectContaining({ compte_id: 2, debit: 90, credit: 0 }),
    ]);
    expect(original.status).toBe(StatutEcriture.REVERSED);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'accounting.entry.reversed',
        resourceId: 11,
      }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      expect.any(Array),
    );
  });

  it('rend la contrepassation idempotente', async () => {
    const original: any = {
      id: 12,
      status: StatutEcriture.REVERSED,
      journal: { code: 'BQ' },
      lignes: [],
    };
    const reversal = {
      id: 13,
      reversalOfId: 12,
      status: StatutEcriture.POSTED,
    };
    ecritureRepository.findOne
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(reversal);

    const result = await runWithTenantContext(2, () =>
      service.contrepasser(12, 'Reprise idempotente de la contrepassation'),
    );

    expect(result).toBe(reversal);
    expect(ecritureRepository.save).not.toHaveBeenCalled();
  });
});
