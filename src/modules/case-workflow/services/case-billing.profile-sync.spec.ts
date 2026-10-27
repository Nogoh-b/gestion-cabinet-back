import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { StatutPaiement } from 'src/modules/paiement/dto/create-paiement.dto';
import {
  BillableItem,
  DossierBillingProfile,
  InvoiceLine,
} from '../entities/billing.entity';
import {
  BillableItemStatus,
  BillableSourceType,
  BillingMode,
} from '../case-workflow.enums';
import { CaseBillingService } from './case-billing.service';

const TENANT_ID = 25;
const FIXED_KEY = 'DOSSIER:91:FIXED_FEE';
const OPENING_KEY = 'DOSSIER:91:OPENING_FEE';

function buildHarness(options: {
  profile: Partial<DossierBillingProfile>;
  items?: Record<string, any>[];
  line?: Record<string, any> | null;
  facture?: Record<string, any> | null;
  openingValidated?: boolean;
}) {
  const profile = {
    id: 'profile-1',
    dossier_id: 91,
    currency: 'XAF',
    vat_rate: 0,
    mode: BillingMode.FIXED,
    fixed_fee: null,
    opening_fee: null,
    opening_fee_enabled: false,
    opening_fee_included_in_fixed_fee: false,
    lock_version: 1,
    ...options.profile,
  };
  const items = options.items ?? [];
  const eventAppend = jest.fn(async () => undefined);
  const profileRepo = { save: jest.fn(async (value: unknown) => value) };
  const itemRepo = {
    findOne: jest.fn(
      async ({ where }: any) =>
        items.find((item) => item.source_event_key === where.source_event_key) ??
        null,
    ),
    save: jest.fn(async (value: unknown) => value),
    count: jest.fn(async () => 2),
  };
  const lineRepo = {
    findOne: jest.fn(async () => options.line ?? null),
    save: jest.fn(async (value: unknown) => value),
  };
  const factureRepo = {
    findOne: jest.fn(async () => options.facture ?? null),
    save: jest.fn(async (value: unknown) => value),
  };
  const dossier = {
    id: 91,
    client_id: 7,
    opening_validated_at:
      options.openingValidated === false ? null : new Date('2026-10-01'),
  };
  const dossierRepo = { findOne: jest.fn(async () => dossier) };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DossierBillingProfile) return profileRepo;
      if (entity === BillableItem) return itemRepo;
      if (entity === InvoiceLine) return lineRepo;
      if (entity === Facture) return factureRepo;
      if (entity === Dossier) return dossierRepo;
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (m: unknown) => Promise<unknown>) =>
      callback(manager),
    ),
  };
  const service = new CaseBillingService(
    dataSource as any,
    { findOne: jest.fn(async () => profile) } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { append: eventAppend } as any,
  );
  const createFixed = jest
    .spyOn(service, 'createFixedFeeItem')
    .mockImplementation(async () => ({ id: 'new-fixed' }) as any);
  const createOpening = jest
    .spyOn(service, 'createOpeningItem')
    .mockImplementation(async () => null);
  const update = (dto: Record<string, unknown>) =>
    new TenantContext().run(TENANT_ID, () =>
      service.updateProfile(91, dto as any, 31),
    );
  return {
    update,
    itemRepo,
    lineRepo,
    factureRepo,
    eventAppend,
    createFixed,
    createOpening,
  };
}

const fixedItem = (overrides: Record<string, any> = {}) => ({
  id: 'item-fixed',
  dossier_id: 91,
  source_event_key: FIXED_KEY,
  source_type: BillableSourceType.MILESTONE,
  status: BillableItemStatus.NEEDS_REVIEW,
  review_reason: 'Montant du forfait manquant',
  currency: 'XAF',
  quantity: 1,
  unit_price: 0,
  net_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  gross_amount: 0,
  invoice_line_id: null,
  ...overrides,
});

describe('CaseBillingService.updateProfile — répercussion sur l’existant', () => {
  it('met à jour un forfait ouvert resté « à vérifier »', async () => {
    const item = fixedItem();
    const { update, eventAppend } = buildHarness({ profile: {}, items: [item] });

    const result = await update({ fixed_fee: 500000, vat_rate: 19.25 });

    expect(item).toMatchObject({
      status: BillableItemStatus.TO_INVOICE,
      review_reason: null,
      net_amount: 500000,
      tax_rate: 19.25,
      tax_amount: 96250,
      gross_amount: 596250,
    });
    expect(result.billing_sync.updated_items).toEqual(['Forfait principal']);
    expect(result.billing_sync.recalculable_items).toBe(2);
    expect(eventAppend).toHaveBeenCalledTimes(1);
  });

  it('ajuste la ligne et les totaux d’une facture brouillon sans paiement', async () => {
    const item = fixedItem({
      status: BillableItemStatus.INVOICED,
      review_reason: null,
      unit_price: 300000,
      net_amount: 300000,
      gross_amount: 300000,
      invoice_line_id: 'line-1',
    });
    const line = { id: 'line-1', facture_id: 'fac-1', net_amount: 300000 };
    const facture = {
      id: 'fac-1',
      numero: 'FAC-2026-0001',
      status: StatutFacture.BROUILLON,
      currency: 'XAF',
      montantHT: 350000,
      montantTVA: 0,
      montantTTC: 350000,
      paiements: [],
    };
    const { update, lineRepo, factureRepo } = buildHarness({
      profile: {},
      items: [item],
      line,
      facture,
    });

    const result = await update({ fixed_fee: 400000 });

    expect(line).toMatchObject({ net_amount: 400000, gross_amount: 400000 });
    expect(facture).toMatchObject({ montantHT: 450000, montantTTC: 450000 });
    expect(lineRepo.save).toHaveBeenCalled();
    expect(factureRepo.save).toHaveBeenCalled();
    expect(result.billing_sync.updated_invoices).toEqual([
      { label: 'Forfait principal', facture_id: 'fac-1', numero: 'FAC-2026-0001' },
    ]);
  });

  it('ne touche pas une facture émise ou payée : elle est signalée', async () => {
    const item = fixedItem({
      status: BillableItemStatus.INVOICED,
      review_reason: null,
      unit_price: 300000,
      net_amount: 300000,
      gross_amount: 300000,
      invoice_line_id: 'line-1',
    });
    const facture = {
      id: 'fac-1',
      numero: 'FAC-2026-0001',
      status: StatutFacture.BROUILLON,
      currency: 'XAF',
      montantHT: 300000,
      montantTVA: 0,
      montantTTC: 300000,
      paiements: [{ status: StatutPaiement.VALIDE }],
    };
    const { update, factureRepo, itemRepo } = buildHarness({
      profile: {},
      items: [item],
      line: { id: 'line-1', facture_id: 'fac-1' },
      facture,
    });

    const result = await update({ fixed_fee: 400000 });

    expect(item.net_amount).toBe(300000);
    expect(facture.montantHT).toBe(300000);
    expect(factureRepo.save).not.toHaveBeenCalled();
    expect(itemRepo.save).not.toHaveBeenCalled();
    expect(result.billing_sync.locked_invoices).toHaveLength(1);
  });

  it('signale un forfait ouvert quand le dossier passe en horaire', async () => {
    const item = fixedItem({
      status: BillableItemStatus.TO_INVOICE,
      review_reason: null,
      net_amount: 300000,
    });
    const { update } = buildHarness({ profile: { fixed_fee: 300000 }, items: [item] });

    const result = await update({ mode: BillingMode.HOURLY, hourly_rate: 50000 });

    expect(item.status).toBe(BillableItemStatus.NEEDS_REVIEW);
    expect(item.review_reason).toMatch(/horaire/);
    expect(result.billing_sync.needs_review).toEqual(['Forfait principal']);
  });

  it('crée le forfait manquant, mais rien avant la validation de l’ouverture', async () => {
    const open = buildHarness({ profile: {} });
    const result = await open.update({ fixed_fee: 250000 });
    expect(open.createFixed).toHaveBeenCalledTimes(1);
    expect(result.billing_sync.created_items).toEqual(['Forfait principal']);

    const draft = buildHarness({ profile: {}, openingValidated: false });
    const draftResult = await draft.update({ fixed_fee: 250000 });
    expect(draft.createFixed).not.toHaveBeenCalled();
    expect(draftResult.billing_sync.created_items).toEqual([]);
  });

  it('met à jour la TVA des frais d’ouverture sans changer leur montant', async () => {
    const item = {
      ...fixedItem(),
      id: 'item-opening',
      source_event_key: OPENING_KEY,
      source_type: BillableSourceType.OPENING_FEE,
      status: BillableItemStatus.TO_INVOICE,
      review_reason: null,
      unit_price: 50000,
      net_amount: 50000,
      gross_amount: 50000,
    };
    const { update } = buildHarness({
      profile: { opening_fee_enabled: true },
      items: [item],
    });

    await update({ vat_rate: 19.25 });

    expect(item).toMatchObject({
      net_amount: 50000,
      tax_amount: 9625,
      gross_amount: 59625,
    });
  });
});
