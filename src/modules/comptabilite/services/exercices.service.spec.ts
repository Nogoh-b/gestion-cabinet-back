import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { Ecriture } from '../entities/ecriture.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import { StatutExercice } from '../enums/comptabilite.enums';
import { ExercicesService } from './exercices.service';

describe('ExercicesService - clôture', () => {
  const exerciceRepository = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const ecritureRepository = { count: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === Ecriture ? ecritureRepository : exerciceRepository,
    ),
    query: jest.fn(),
  };
  const repo = {
    manager: {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    },
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-exercise-1' })),
  };
  const closeDto = {
    rapportCloture:
      'Tous les contrôles de clôture ont été exécutés et validés.',
    referenceRapprochement: 'RAPP-2026-001',
    rapprochementsValides: true as const,
  };
  let service: ExercicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExercicesService(repo as any, {} as any, audit as any);
    exerciceRepository.findOne.mockResolvedValue({
      id: 5,
      annee: 2026,
      statut: StatutExercice.OUVERT,
    });
    ecritureRepository.count.mockResolvedValue(0);
    manager.query.mockResolvedValue([]);
    exerciceRepository.save.mockImplementation(async (value) => value);
  });

  it('refuse la clôture tant qu’une écriture brouillon subsiste', async () => {
    ecritureRepository.count.mockResolvedValue(1);

    await expect(
      runWithTenantContext(2, () => service.cloturer(5, closeDto)),
    ).rejects.toThrow('brouillon');
    expect(exerciceRepository.save).not.toHaveBeenCalled();
  });

  it('refuse la clôture si une écriture historique est déséquilibrée', async () => {
    manager.query.mockResolvedValue([{ id: 99 }]);

    await expect(
      runWithTenantContext(2, () => service.cloturer(5, closeDto)),
    ).rejects.toThrow('déséquilibrée');
  });

  it('clôture sous verrou quand tous les contrôles réussissent', async () => {
    const result = await runWithTenantContext(2, () =>
      service.cloturer(5, closeDto, { userId: 9 }),
    );

    expect(result.statut).toBe(StatutExercice.CLOTURE);
    expect(result.dateCloture).toBeInstanceOf(Date);
    expect(result.closingReport).toBe(closeDto.rapportCloture);
    expect(result.reconciliationReference).toBe(
      closeDto.referenceRapprochement,
    );
    expect(result.closedBy).toBe('9');
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: 9,
        action: 'accounting.exercise.closed',
        resourceId: 5,
      }),
    );
    expect(exerciceRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });
});
