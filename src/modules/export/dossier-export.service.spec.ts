/// <reference types="jest" />
import * as fs from 'fs';
import { ZipArchive } from 'archiver';
import { hiddenResponseFields } from 'src/core/security/restricted-fields';
import { DossierExportService } from './dossier-export.service';

// archiver est publié en ESM : remplacé par une archive factice.
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

const lawyer = {
  role: 'avocat',
  permissions: ['view_dossiers', 'view_billable_items', 'view_dossier_referrals'],
};
const accountant = {
  role: 'comptable',
  permissions: ['view_dossiers', 'view_factures', 'view_payroll'],
};
const dossier = () => ({
  id: 7,
  dossier_number: 'DOS-2026-0007',
  object: 'Recouvrement',
  budget_estimate: 500000,
  lawyer: { id: 31, full_name: 'Me Ndi', salary: 900000, hourly_rate: 40000 },
});

describe('DossierExportService archive', () => {
  function exportFor(user: typeof lawyer) {
    const repo = (rows: any[]) => ({ find: jest.fn().mockResolvedValue(rows) });
    const factureRepo = repo([
      { id: 'f1', numero: 'F-1', status: '2', montantTTC: '60000.00' },
      { id: 'f2', numero: 'F-2', status: '5', montantTTC: '20000.00' },
    ]);
    const paiementRepo = repo([
      { id: 'p1', montant: '25000.00', status: '1', modePaiement: '2', facture: { id: 'f1', numero: 'F-1' } },
      { id: 'p2', montant: '5000.00', status: '0', modePaiement: '0', facture: { id: 'f1', numero: 'F-1' } },
    ]);
    const service = new DossierExportService(
      { findOne: jest.fn().mockResolvedValue(dossier()) } as any,
      repo([]) as any,
      factureRepo as any,
      paiementRepo as any,
      repo([]) as any,
      repo([{ id: 5, title: 'Conclusions', assigned_lawyer: dossier().lawyer }]) as any,
      repo([]) as any,
    );
    const files = new Map<string, string>();
    const archive = {
      append: (content: string, { name }: { name: string }) => files.set(name, content),
      file: jest.fn(),
    };
    return (service as any)
      .addDossier(archive, 7, hiddenResponseFields(user), {})
      .then(() => ({ files, factureRepo, paiementRepo }));
  }

  it('leaves invoices, payments and salaries out of a lawyer export', async () => {
    const { files, factureRepo } = await exportFor(lawyer);
    const names = [...files.keys()].map((name) => name.split('/').pop());

    expect(factureRepo.find).not.toHaveBeenCalled();
    expect(names).not.toEqual(expect.arrayContaining(['factures.csv']));
    expect(names).not.toEqual(expect.arrayContaining(['paiements.json']));
    const summary = files.get('Dossier_DOS-2026-0007/resume.txt')!;
    expect(summary).not.toMatch(/Factures|Paiements|Solde/);
    expect(files.get('Dossier_DOS-2026-0007/diligences.json')).not.toContain('salary');
  });

  it('keeps the full archive for a user allowed to see invoices', async () => {
    const { files } = await exportFor(accountant);
    expect(files.has('Dossier_DOS-2026-0007/factures.csv')).toBe(true);
    expect(files.get('Dossier_DOS-2026-0007/resume.txt')).toContain('Solde restant');
  });

  // GET /exports/dossiers/90 : « Property "factureId" was not found in "Paiement" ».
  it('loads payments through the facture relation and totals validated ones only', async () => {
    const { files, paiementRepo } = await exportFor(accountant);
    const [options] = paiementRepo.find.mock.calls[0] as any[];
    expect(options.where.facture.id).toBeDefined();
    expect(options.where).not.toHaveProperty('factureId');

    const summary = files.get('Dossier_DOS-2026-0007/resume.txt')!;
    const amounts = summary.replace(/\s/g, ' ');
    expect(amounts).toMatch(/total hors annulées : 60 000,00/);
    expect(amounts).toMatch(/dont 1 annulée\(s\) : 20 000,00/);
    expect(amounts).toMatch(/encaissé validé : 25 000,00/);
    expect(amounts).toMatch(/Solde restant  : 35 000,00/);
    expect(summary).toMatch(/F-2 .*Annulée.*annulée, hors totaux/);
    expect(files.get('Dossier_DOS-2026-0007/paiements.csv')).toContain('Espèces');
  });
});

/**
 * GET /exports/dossiers : même portée que la liste des dossiers — un avocat
 * n'exporte que les dossiers dont il est l'avocat responsable, même en
 * devinant l'identifiant d'un dossier d'un confrère.
 */
describe('DossierExportService role scope', () => {
  // Dossier 7 : Me Ndi (31) ; dossier 8 : un confrère (40).
  const rows = [
    { id: 7, dossier_number: 'DOS-2026-0007', lawyer_id: 31, client_id: 83 },
    { id: 8, dossier_number: 'DOS-2026-0008', lawyer_id: 40, client_id: 84 },
  ];
  /** Applique le `where` comme la base : identifiant + portée du rôle. */
  const findOne = jest.fn(
    async ({ where }: any) =>
      rows.find(
        (row) =>
          row.id === where.id &&
          (where.lawyer === undefined || where.lawyer.id === row.lawyer_id) &&
          (where.client_id === undefined || where.client_id === row.client_id),
      ) ?? null,
  );

  beforeAll(() => {
    // Ni dossier uploads/exports créé, ni copie du ZIP écrite sur le disque.
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'createWriteStream').mockReturnValue({} as any);
  });
  afterAll(() => jest.restoreAllMocks());

  /** Racines de l'archive produite : un dossier par export, ou README.txt. */
  async function exportRoots(ids: number[], user: object): Promise<string[]> {
    const files = new Map<string, string>();
    (ZipArchive as unknown as jest.Mock).mockImplementation(() => ({
      on: jest.fn(),
      pipe: jest.fn(),
      append: (content: string, { name }: { name: string }) => files.set(name, content),
      file: jest.fn(),
      finalize: jest.fn().mockResolvedValue(undefined),
    }));
    const repo = () => ({ find: jest.fn().mockResolvedValue([]) }) as any;
    const service = new DossierExportService(
      { findOne } as any,
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
    );
    findOne.mockClear();

    await service.streamZip({ setHeader: jest.fn() } as any, ids, user as any);
    return [...new Set([...files.keys()].map((name) => name.split('/')[0]))];
  }

  it("leaves a colleague's dossier out of a lawyer export", async () => {
    const user = { id: 31, ...lawyer };

    expect(await exportRoots([7, 8], user)).toEqual(['Dossier_DOS-2026-0007']);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8, lawyer: { id: 31 } } }),
    );
  });

  it('applies the scope to a cabinet role based on the lawyer role', async () => {
    const user = { id: 31, role: 'avocat_associe', base_role: 'avocat', permissions: ['view_dossiers'] };

    expect(await exportRoots([7, 8], user)).toEqual(['Dossier_DOS-2026-0007']);
  });

  it('answers with the README when no requested dossier is in scope', async () => {
    const user = { id: 31, ...lawyer };

    expect(await exportRoots([8], user)).toEqual(['README.txt']);
  });

  it('keeps every requested dossier in an admin export', async () => {
    const admin = { id: 1, role: 'admin', permissions: [] };

    expect(await exportRoots([7, 8], admin)).toEqual([
      'Dossier_DOS-2026-0007',
      'Dossier_DOS-2026-0008',
    ]);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8 } }),
    );
  });
});
