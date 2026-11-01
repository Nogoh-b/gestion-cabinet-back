import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import {
  SourceModule,
  StatutExercice,
  TypeJournal,
} from '../enums/comptabilite.enums';
import { Ecriture } from '../entities/ecriture.entity';
import { ExerciceComptable } from '../entities/exercice.entity';
import { JournalComptable } from '../entities/journal.entity';
import { CompteComptable } from '../entities/compte.entity';
import { EcrituresService } from './ecritures.service';

describe('EcrituresService - protection des exercices clôturés', () => {
  const ecritureRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const exerciceRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const journalRepo = { findOne: jest.fn() };
  const compteRepo = { findOne: jest.fn() };
  const initialisation = { initialiser: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Ecriture) return ecritureRepo;
      if (entity === ExerciceComptable) return exerciceRepo;
      if (entity === JournalComptable) return journalRepo;
      if (entity === CompteComptable) return compteRepo;
      throw new Error('Dépôt inattendu');
    }),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  let service: EcrituresService;

  const dto = {
    dateEcriture: '2026-06-15',
    libelle: 'Écriture tardive',
    codeJournal: TypeJournal.BANQUE,
    sourceModule: SourceModule.PAIEMENT,
    sourceId: 'payment-1',
    lignes: [
      { numeroCompte: '512', debit: 100, credit: 0 },
      { numeroCompte: '411', debit: 0, credit: 100 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EcrituresService(
      ecritureRepo as any,
      exerciceRepo as any,
      journalRepo as any,
      compteRepo as any,
      initialisation as any,
      dataSource as any,
      {} as any,
    );
    ecritureRepo.findOne.mockResolvedValue(null);
    exerciceRepo.findOne.mockResolvedValue({
      id: 1,
      annee: 2026,
      statut: StatutExercice.CLOTURE,
    });
    journalRepo.findOne.mockResolvedValue({ id: 1, code: 'BNQ' });
    compteRepo.findOne.mockResolvedValue({ id: 1 });
  });

  it('refuse une saisie manuelle dans un exercice clôturé', async () => {
    await expect(
      runWithTenantContext(2, () => service.creer(dto as any, false)),
    ).rejects.toThrow('clôturé');
    expect(ecritureRepo.save).not.toHaveBeenCalled();
  });

  it('refuse également une écriture automatique issue de l’outbox', async () => {
    await expect(
      runWithTenantContext(2, () => service.creer(dto as any, true)),
    ).rejects.toThrow('clôturé');
    expect(ecritureRepo.save).not.toHaveBeenCalled();
  });
});
