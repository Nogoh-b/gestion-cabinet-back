import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  ClientSatisfaction,
  DossierOutcome,
} from 'src/modules/dossiers/entities/dossier.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import {
  ModePaiement,
  StatutPaiement,
} from 'src/modules/paiement/dto/create-paiement.dto';
import {
  BillableCategory,
  BillableItemStatus,
  BillingCalculationMode,
  DossierActionStatus,
} from '../case-workflow.enums';
import { CaseWorkflowService } from './case-workflow.service';

function createService(repositories: {
  dossier?: unknown;
  actions?: unknown[];
  items?: unknown[];
  factures?: unknown[];
}) {
  const dossierRepository = {
    findOne: jest.fn(async () => repositories.dossier ?? null),
  };
  const actionRepository = {
    find: jest.fn(async () => repositories.actions ?? []),
  };
  const itemRepository = { find: jest.fn(async () => repositories.items ?? []) };
  const factureRepository = {
    find: jest.fn(async () => repositories.factures ?? []),
  };
  const service = new CaseWorkflowService(
    {} as any,
    dossierRepository as any,
    {} as any,
    actionRepository as any,
    {} as any,
    itemRepository as any,
    {} as any,
    {} as any,
    {} as any,
    factureRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return {
    service,
    dossierRepository,
    actionRepository,
    itemRepository,
    factureRepository,
  };
}

const dossier = {
  id: 12,
  tenant_id: 22,
  dossier_number: 'DOS-2026-0012',
  object: 'Litige commercial',
  client: { full_name: 'Client A' },
  lifecycle_phase: 'CLOSED',
  closing_date: new Date('2026-09-30'),
  outcome: DossierOutcome.WON,
  outcome_notes: 'Jugement favorable',
  outcome_date: new Date('2026-09-28'),
  client_satisfaction: ClientSatisfaction.SATISFIED,
  created_at: new Date('2026-01-10'),
};

describe('CaseWorkflowService - récapitulatif de clôture', () => {
  it('signale un dossier introuvable', async () => {
    const { service } = createService({ dossier: null });
    await expect(
      new TenantContext().run(22, () => service.closureRecap(999)),
    ).rejects.toThrow('Dossier introuvable');
  });

  it('agrège actions, factures, paiements validés et éléments ouverts', async () => {
    const { service } = createService({
      dossier,
      actions: [
        {
          id: 'act-1',
          title: 'Assignation',
          definition_label: 'Assignation',
          definition: { family: { label: 'Procédure' } },
          status: DossierActionStatus.COMPLETED,
          completed_at: new Date('2026-03-01'),
        },
      ],
      items: [
        {
          label: 'Débours - Greffe',
          category: BillableCategory.DISBURSEMENT,
          calculation_mode: BillingCalculationMode.ACTUAL_COST,
          quantity: 1,
          unit_price: 2000,
          gross_amount: 2000,
          currency: 'XAF',
          status: BillableItemStatus.TO_INVOICE,
          occurred_at: new Date('2026-04-02'),
        },
      ],
      factures: [
        {
          id: 'fac-1',
          numero: 'F-2026-001',
          dateFacture: new Date('2026-05-01'),
          dateEcheance: new Date('2026-05-31'),
          currency: 'XAF',
          montantTTC: 60000,
          status: StatutFacture.PARTIELLEMENT_PAYEE,
          lines: [
            {
              label: 'Honoraires forfaitaires',
              category: BillableCategory.HONORARIUM,
              calculation_mode: BillingCalculationMode.FIXED,
              quantity: 1,
              unit_price: 50000,
              net_amount: 50000,
              tax_rate: 20,
              gross_amount: 60000,
              display_order: 0,
            },
          ],
          paiements: [
            {
              status: StatutPaiement.VALIDE,
              datePaiement: new Date('2026-05-10'),
              modePaiement: ModePaiement.VIREMENT,
              montant: 20000,
              reference: 'VIR-1',
            },
            {
              status: StatutPaiement.EN_ATTENTE,
              datePaiement: new Date('2026-05-12'),
              modePaiement: ModePaiement.ESPECES,
              montant: 40000,
              reference: null,
            },
          ],
        },
        {
          id: 'fac-annulee',
          numero: 'F-2026-002',
          dateFacture: new Date('2026-05-02'),
          dateEcheance: new Date('2026-06-01'),
          currency: 'XAF',
          montantTTC: 30000,
          status: StatutFacture.ANNULEE,
          lines: [],
          paiements: [],
        },
      ],
    });

    const recap = await new TenantContext().run(22, () =>
      service.closureRecap(12),
    );

    expect(recap.dossier).toMatchObject({
      dossier_number: 'DOS-2026-0012',
      client_name: 'Client A',
      outcome: DossierOutcome.WON,
      client_satisfaction: ClientSatisfaction.SATISFIED,
    });
    expect(recap.actions).toHaveLength(1);
    expect(recap.actions[0]).toMatchObject({
      title: 'Assignation',
      family: 'Procédure',
    });
    expect(recap.billing.invoices).toHaveLength(2);
    expect(recap.billing.invoices[0]).toMatchObject({
      numero: 'F-2026-001',
      total: 60000,
      paid: 20000,
      remaining: 40000,
    });
    expect(recap.billing.invoices[0].payments).toHaveLength(1);
    expect(recap.billing.invoices[0].lines[0]).toMatchObject({
      category: BillableCategory.HONORARIUM,
      calculation_mode: BillingCalculationMode.FIXED,
    });
    expect(recap.billing.open_items).toHaveLength(1);
    expect(recap.billing.totals).toMatchObject({
      billed: 60000,
      paid: 20000,
      remaining: 40000,
      open_amount: 2000,
    });
  });

  it('isole les lectures par cabinet', async () => {
    const {
      service,
      dossierRepository,
      actionRepository,
      itemRepository,
      factureRepository,
    } = createService({ dossier });
    await new TenantContext().run(22, () => service.closureRecap(12));
    for (const repository of [
      dossierRepository,
      actionRepository,
      itemRepository,
      factureRepository,
    ]) {
      const mock = (
        (repository as { findOne?: unknown }).findOne ??
        (repository as { find?: unknown }).find
      ) as any;
      const calls = mock.mock.calls as Array<[{ where: { tenant_id: number } }]>;
      expect(calls.length).toBeGreaterThan(0);
      for (const [options] of calls) {
        expect(options.where.tenant_id).toBe(22);
      }
    }
  });
});
