import { describe, expect, it, jest } from '@jest/globals';
import { FactureService } from './facture.service';

/**
 * Libellé + TVA par défaut des factures :
 *  - libellé vide/absent → reprend le numéro de la facture ;
 *  - TVA non saisie → profil de facturation du dossier, sinon cabinet.
 */
function createService(deps: {
  profileVatRate?: number | null;
  cabinetTva?: number;
  generateNumero?: string;
}) {
  const service = Object.create(
    FactureService.prototype,
  ) as FactureService & {
    repository: { create: (v: any) => any };
    cabinetRepo: { findOne: () => Promise<any> };
    invoiceTypeRepo: unknown;
  };
  const created: any[] = [];
  Object.assign(service as object, {
    repository: {
      create: jest.fn((value: any) => {
        created.push(value);
        return value;
      }),
      manager: {
        getRepository: () => ({
          findOne: jest.fn(async () =>
            deps.profileVatRate === undefined ||
            deps.profileVatRate === null
              ? null
              : { vat_rate: deps.profileVatRate },
          ),
        }),
      },
    },
    cabinetRepo: {
      findOne: jest.fn(async () => ({
        currency: 'XAF',
        default_tva_rate: deps.cabinetTva ?? 0,
      })),
    },
    invoiceTypeRepo: {},
    dossiersService: {
      findOne: jest.fn(async () => ({
        id: 12,
        client: { id: 7 },
      })),
    },
    resolveInvoiceType: jest.fn(async () => null),
    generateFacNumber: jest.fn(
      async () => deps.generateNumero ?? 'FAC-2026-0001',
    ),
    invoiceNumberExists: jest.fn(async () => false),
    saveWithUniqueInvoiceNumber: jest.fn(async (facture: any) => ({
      ...facture,
      id: 'facture-uuid-1',
    })),
  });
  return { service, created };
}

const baseDto = {
  dossierId: 12,
  clientId: 7,
  type: 0,
  dateFacture: new Date('2026-10-01'),
  dateEcheance: new Date('2026-10-31'),
  montantHT: 100000,
  description: 'Prestations',
} as any;

describe('FactureService - libellé et TVA par défaut', () => {
  it('reprend le numéro comme libellé quand aucun libellé saisi', async () => {
    const { service, created } = createService({
      profileVatRate: 19.25,
      generateNumero: 'FAC-2026-0042',
    });
    const result = await (service as any).createFacture({ ...baseDto });
    expect(result.libelle).toBe('FAC-2026-0042');
    expect(created[0].tauxTVA).toBe(19.25);
    expect(created[0].montantTVA).toBeCloseTo(19250, 5);
    expect(created[0].montantTTC).toBeCloseTo(119250, 5);
  });

  it('conserve le libellé saisi et la TVA saisie', async () => {
    const { service } = createService({ profileVatRate: 19.25 });
    const result = await (service as any).createFacture({
      ...baseDto,
      libelle: '  Honoraires dossier  ',
      tauxTVA: 10,
      montantTVA: 0,
      montantTTC: 0,
    });
    expect(result.libelle).toBe('Honoraires dossier');
    expect(result.tauxTVA).toBe(10);
    expect(result.montantTTC).toBeCloseTo(110000, 5);
  });

  it('replie la TVA sur le défaut du cabinet sans profil dossier', async () => {
    const { service, created } = createService({
      profileVatRate: null,
      cabinetTva: 20,
    });
    await (service as any).createFacture({ ...baseDto });
    expect(created[0].tauxTVA).toBe(20);
  });

  it('un libellé vidé en modification retombe sur le numéro', async () => {
    const { service } = createService({});
    const findOneV1 = jest.fn(async () => ({
      id: 'facture-uuid-1',
      numero: 'FAC-2026-0009',
      libelle: 'Ancien libellé',
      montantHT: 50000,
      tauxTVA: 19.25,
      status: 0,
    }));
    const saved: any[] = [];
    Object.assign(service as object, {
      findOneV1,
      repository: {
        ...(service as any).repository,
        save: jest.fn(async (value: any) => {
          saved.push(value);
          return value;
        }),
      },
      normalizeStatus: (value: any) => value,
    });
    const { plainToInstance } = await import('class-transformer');
    expect(typeof plainToInstance).toBe('function');
    await (service as any).updateFacture('facture-uuid-1', {
      libelle: '   ',
      tauxTVA: 10,
    } as any);
    expect(saved[0].libelle).toBe('FAC-2026-0009');
    expect(saved[0].montantTVA).toBeCloseTo(5000, 5);
    expect(saved[0].montantTTC).toBeCloseTo(55000, 5);
  });
});
