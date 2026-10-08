import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { StatutFacture, TypeFacture } from 'src/modules/facture/dto/create-facture.dto';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import {
  ModePaiement,
  StatutPaiement,
} from 'src/modules/paiement/dto/create-paiement.dto';
import { Paiement } from 'src/modules/paiement/entities/paiement.entity';
import { PaiementService } from './paiement.service';

function invoice(patch: Record<string, unknown> = {}) {
  return {
    id: 'fac-1',
    numero: 'F-2026-001',
    tenant_id: 22,
    dossier_id: 12,
    type: TypeFacture.HONORAIRES,
    status: StatutFacture.ENVOYEE,
    dateFacture: new Date('2026-05-01'),
    dateEcheance: new Date('2026-05-31'),
    montantTTC: 10000,
    paiements: [],
    ...patch,
  };
}

function setup(options: {
  dossier?: unknown;
  factures?: unknown[];
  avoirNumero?: string;
}) {
  const savedPaiements: unknown[] = [];
  const savedFactures: unknown[] = [];
  const factureFind = jest.fn(async () => options.factures ?? []);
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Dossier) {
        return { findOne: jest.fn(async () => options.dossier ?? null) };
      }
      if (entity === Facture) {
        return {
          find: factureFind,
          save: jest.fn(async (value: unknown) => {
            savedFactures.push({ ...(value as Record<string, unknown>) });
            return value;
          }),
        };
      }
      if (entity === Paiement) {
        return {
          create: jest.fn((value: unknown) => value),
          save: jest.fn(async (value: Record<string, unknown>) => {
            const saved = { id: `pay-${savedPaiements.length + 1}`, ...value };
            savedPaiements.push(saved);
            return saved;
          }),
        };
      }
      throw new Error('unexpected repository');
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
      work(manager),
    ),
  };
  const factureService = {
    createFacture: jest.fn(async () => ({
      id: 'avoir-1',
      numero: options.avoirNumero ?? 'AV-2026-001',
    })),
  };
  const service = new PaiementService(
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    factureService as any,
  );
  return { service, manager, dataSource, factureService, factureFind, savedPaiements, savedFactures };
}

const dossier = {
  id: 12,
  tenant_id: 22,
  dossier_number: 'DOS-12',
  client_id: 5,
  client: { id: 5 },
};

describe("PaiementService - encaissement groupé d'un dossier", () => {
  it('ventile un montant global des échéances les plus anciennes', async () => {
    const { service, savedPaiements } = setup({
      dossier,
      factures: [
        invoice({ id: 'fac-old', numero: 'F-OLD', dateEcheance: new Date('2026-05-31'), montantTTC: 10000 }),
        invoice({ id: 'fac-new', numero: 'F-NEW', dateEcheance: new Date('2026-06-30'), montantTTC: 30000 }),
      ],
    });
    const result = await new TenantContext().run(22, () =>
      service.allocateDossierPayment(12, {
        montant_total: 25000,
        mode_paiement: ModePaiement.VIREMENT,
      } as any),
    );
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0]).toMatchObject({
      facture_id: 'fac-old',
      montant: 10000,
      status: StatutFacture.PAYEE,
    });
    expect(result.allocations[1]).toMatchObject({
      facture_id: 'fac-new',
      montant: 15000,
      status: StatutFacture.PARTIELLEMENT_PAYEE,
    });
    expect(result.total_allocated).toBe(25000);
    expect(result.avoir).toBeNull();
    expect(savedPaiements).toHaveLength(2);
  });

  it('convertit le trop-perçu en avoir lié à la dernière facture', async () => {
    const { service, factureService } = setup({
      dossier,
      factures: [invoice({ montantTTC: 10000 })],
    });
    const result = await new TenantContext().run(22, () =>
      service.allocateDossierPayment(12, { montant_total: 14000 } as any),
    );
    expect(result.total_allocated).toBe(10000);
    expect(result.avoir).toMatchObject({ numero: 'AV-2026-001', montant: 4000 });
    expect(factureService.createFacture).toHaveBeenCalledTimes(1);
    const [dto] = factureService.createFacture.mock.calls[0] as any[];
    expect(dto).toMatchObject({
      type: TypeFacture.AVOIR,
      original_facture_id: 'fac-1',
      montantTTC: -4000,
    });
  });

  it('accepte des factures cochées et refuse le dépassement', async () => {
    const { service } = setup({
      dossier,
      factures: [invoice({ montantTTC: 10000 })],
    });
    const ok = await new TenantContext().run(22, () =>
      service.allocateDossierPayment(12, {
        allocations: [{ facture_id: 'fac-1', montant: 4000 }],
      } as any),
    );
    expect(ok.allocations[0]).toMatchObject({
      montant: 4000,
      remaining_after: 6000,
    });
    await expect(
      new TenantContext().run(22, () =>
        service.allocateDossierPayment(12, {
          allocations: [{ facture_id: 'fac-1', montant: 11000 }],
        } as any),
      ),
    ).rejects.toThrow('reste à payer');
    await expect(
      new TenantContext().run(22, () =>
        service.allocateDossierPayment(12, {
          allocations: [{ facture_id: 'fac-unknown', montant: 100 }],
        } as any),
      ),
    ).rejects.toThrow("n'est pas encaissable");
  });

  it('signale un dossier sans facture à encaisser', async () => {
    const { service } = setup({ dossier, factures: [] });
    await expect(
      new TenantContext().run(22, () =>
        service.allocateDossierPayment(12, { montant_total: 5000 } as any),
      ),
    ).rejects.toThrow('Aucune facture à encaisser');
  });

  it('filtre les statuts SQL avec des chaînes (ENUM MySQL)', async () => {
    const { service, factureFind } = setup({
      dossier,
      factures: [invoice({ montantTTC: 10000 })],
    });
    await new TenantContext().run(22, () =>
      service.allocateDossierPayment(12, { montant_total: 5000 } as any),
    );
    const where = ((factureFind as unknown as jest.Mock).mock.calls[0][0] as any).where;
    // Régression : des nombres ici feraient matcher l'INDEX 1-based de
    // l'ENUM ('0','1','3') au lieu des valeurs ('0','1','2','4').
    expect(where.status.value).toEqual(['0', '1', '2', '4']);
  });

  it('compte les paiements validés même quand MySQL renvoie des chaînes', async () => {
    const { service } = setup({
      dossier,
      factures: [
        invoice({
          montantTTC: 10000,
          paiements: [{ id: 'pay-old', status: '1', montant: 6000 }],
        }),
      ],
    });
    const result = await new TenantContext().run(22, () =>
      service.allocateDossierPayment(12, { montant_total: 4000 } as any),
    );
    // Reste réel : 4000. Sans Number(), le déjà-payé vaut 0 et la facture
    // resterait PARTIELLEMENT_PAYEE avec 6000 de reste.
    expect(result.allocations[0]).toMatchObject({
      montant: 4000,
      remaining_after: 0,
      status: StatutFacture.PAYEE,
    });
    expect(result.total_allocated).toBe(4000);
  });

  it('persiste le statut sans repasser les paiements périmés à save()', async () => {
    const { service, savedFactures } = setup({
      dossier,
      factures: [invoice({ montantTTC: 10000, paiements: [] })],
    });
    await new TenantContext().run(22, () =>
      service.allocateDossierPayment(12, { montant_total: 5000 } as any),
    );
    // Régression FK 1452 : le tableau `paiements` chargé avant l'insert ne
    // doit pas être persisté, sinon TypeORM détache le paiement inséré
    // (UPDATE paiements SET facture_id = NULL).
    expect(savedFactures).toHaveLength(1);
    expect((savedFactures[0] as any).paiements).toBeUndefined();
  });
});
