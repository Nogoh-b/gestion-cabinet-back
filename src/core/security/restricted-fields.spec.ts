/// <reference types="jest" />
import { lastValueFrom, of } from 'rxjs';
import { AI_RESTRICTED_COLUMNS } from 'src/core/ai-database/ai-access-policy';
import {
  RESTRICTED_RESPONSE_FIELDS,
  hiddenResponseFields,
  redactRestrictedFields,
  stripRestrictedInput,
} from './restricted-fields';
import { RestrictedFieldsInterceptor } from './restricted-fields.interceptor';

// Droits de l'avocat seedé : éléments facturables et apports, mais ni
// factures, ni commissions, ni paie.
const lawyer = {
  role: 'avocat',
  permissions: [
    'view_dossiers',
    'edit_dossier',
    'view_billable_items',
    'view_dossier_referrals',
  ],
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
  procedure_costs: 25000,
  actual_costs: 120000,
  total_factures_amount: 120000,
  paid_factures_amount: 60000,
  paid_amount: 60000,
  facture_count: 2,
  factures: [{ id: 1, montantTTC: 60000 }],
  settlement_amount: 300000,
  damages_awarded: 150000,
  costs_awarded: 20000,
  opening_date: new Date('2026-01-05T00:00:00Z'),
  lawyer: { id: 31, full_name: 'Me Ndi', salary: 900000, hourly_rate: 40000 },
});

describe('restricted fields policy', () => {
  it('covers every column the AI assistant hides, with the same rights', () => {
    for (const columns of Object.values(AI_RESTRICTED_COLUMNS)) {
      for (const [column, permissions] of Object.entries(columns)) {
        expect(RESTRICTED_RESPONSE_FIELDS[column]).toEqual(
          expect.arrayContaining(permissions),
        );
      }
    }
  });

  it('removes dossier amounts and invoices for a lawyer, keeps case outcome data', () => {
    const result: any = redactRestrictedFields(
      { data: [dossier()], meta: { total: 1 } },
      hiddenResponseFields(lawyer),
    );
    const [row] = result.data;

    for (const field of [
      'budget_estimate',
      'procedure_costs',
      'actual_costs',
      'total_factures_amount',
      'paid_factures_amount',
      'paid_amount',
      'facture_count',
      'factures',
    ]) {
      expect(row).not.toHaveProperty(field);
    }
    expect(row).toMatchObject({
      dossier_number: 'DOS-2026-0007',
      settlement_amount: 300000,
      damages_awarded: 150000,
      costs_awarded: 20000,
    });
    expect(row.opening_date).toBeInstanceOf(Date);
    // Paie absente → salaire masqué ; taux horaire gardé (éléments facturables).
    expect(row.lawyer).not.toHaveProperty('salary');
    expect(row.lawyer.hourly_rate).toBe(40000);
    expect(result.meta).toEqual({ total: 1 });
  });

  it('reaches dossiers nested in other resources', () => {
    const audience = { id: 3, audience_date: '2026-03-12', dossier: dossier() };
    const result: any = redactRestrictedFields(audience, hiddenResponseFields(lawyer));
    expect(result.dossier).not.toHaveProperty('budget_estimate');
    expect(result.dossier).not.toHaveProperty('factures');
    expect(result.audience_date).toBe('2026-03-12');
  });

  it('keeps generic names such as paid_amount outside dossier objects', () => {
    const result: any = redactRestrictedFields(
      { supplier_invoice: { id: 1, paid_amount: 1000 } },
      hiddenResponseFields(lawyer),
    );
    expect(result.supplier_invoice.paid_amount).toBe(1000);
  });

  it('hides referral commissions and client invoice totals', () => {
    const result: any = redactRestrictedFields(
      {
        referral: {
          id: 4,
          commission_rate: 10,
          commission_amount: null,
          total_paid_commissions: 5000,
          total_pending_commissions: 2000,
          referral_date: '2026-02-01',
        },
        client: {
          id: 9,
          total_factures_amount: 80000,
          paid_factures_amount: 0,
          outstanding_balance: 80000,
        },
        stats: { financialStats: { totalBudgetEstimate: 1 }, kpis: { open: 3 } },
      },
      hiddenResponseFields(lawyer),
    );
    expect(result.referral).toEqual({ id: 4, referral_date: '2026-02-01' });
    expect(result.client).toEqual({ id: 9 });
    expect(result.stats).toEqual({ kpis: { open: 3 } });
  });

  it('leaves everything to users holding the rights, admins and the client portal', () => {
    const body = { data: [dossier()] };
    for (const user of [
      { role: 'admin', permissions: [] },
      { role: 'avocat', permissions: ['SUPER_ADMIN'] },
      { role: 'client', permissions: [] },
    ]) {
      expect(redactRestrictedFields(body, hiddenResponseFields(user))).toBe(body);
    }
    const asAccountant: any = redactRestrictedFields(
      body,
      hiddenResponseFields(accountant),
    );
    expect(asAccountant.data[0].budget_estimate).toBe(500000);
    expect(asAccountant.data[0].lawyer.salary).toBe(900000);
    // Sans commissions ni éléments facturables : seules ces colonnes tombent.
    expect(hiddenResponseFields(accountant).everywhere).toEqual(
      new Set([
        'default_rate',
        'commission_rate',
        'commission_amount',
        'total_paid_commissions',
        'total_pending_commissions',
      ]),
    );
  });

  it('never mutates the response it is given and keeps prototypes', () => {
    class DossierDto {
      constructor(public dossier_number: string, public budget_estimate: number) {}
      get label() {
        return `#${this.dossier_number}`;
      }
    }
    const untouched = { id: 1, name: 'Agence' };
    const original = { dossier: new DossierDto('D-1', 1000), branch: untouched };
    const result: any = redactRestrictedFields(original, hiddenResponseFields(lawyer));

    expect(original.dossier.budget_estimate).toBe(1000);
    expect(result.dossier).toBeInstanceOf(DossierDto);
    expect(result.dossier.label).toBe('#D-1');
    expect(result.dossier).not.toHaveProperty('budget_estimate');
    expect(result.branch).toBe(untouched);
  });

  it('survives circular relations', () => {
    const client: any = { id: 2, total_factures_amount: 10 };
    const row: any = { dossier_number: 'D-2', budget_estimate: 5, client };
    client.dossiers = [row];
    const result: any = redactRestrictedFields(row, hiddenResponseFields(lawyer));
    expect(result.client).not.toHaveProperty('total_factures_amount');
    expect(result.client.dossiers[0]).toBe(result);
    expect(result).not.toHaveProperty('budget_estimate');
  });
});

describe('stripRestrictedInput', () => {
  it('drops the table columns a user cannot read from an update', () => {
    const dto = { object: 'Nouveau', budget_estimate: 0, procedure_costs: null };
    expect(stripRestrictedInput('dossiers', dto, lawyer)).toEqual({ object: 'Nouveau' });
    expect(dto).toHaveProperty('budget_estimate', 0);
  });

  it('only touches the columns of the given table', () => {
    const dto = { salary: 0, hourly_rate: null, specialization: 'Droit social' };
    // Taux horaire visible avec les éléments facturables, pas le salaire.
    expect(stripRestrictedInput('employee', dto, lawyer)).toEqual({
      hourly_rate: null,
      specialization: 'Droit social',
    });
    expect(stripRestrictedInput('dossier_referral', dto, lawyer)).toBe(dto);
  });

  it('keeps the payload of users holding the right', () => {
    const dto = { budget_estimate: 1000 };
    expect(stripRestrictedInput('dossiers', dto, accountant)).toBe(dto);
    expect(stripRestrictedInput('dossiers', dto, { role: 'admin', permissions: [] })).toBe(dto);
  });
});

describe('RestrictedFieldsInterceptor', () => {
  const contextFor = (user: unknown) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  it('redacts the serialized body for a lawyer', async () => {
    const body = { data: dossier() };
    const result: any = await lastValueFrom(
      new RestrictedFieldsInterceptor().intercept(contextFor(lawyer), {
        handle: () => of(body),
      }),
    );
    expect(result.data).not.toHaveProperty('budget_estimate');
    expect(body.data.budget_estimate).toBe(500000);
  });

  it('passes the stream through untouched when nothing is hidden', () => {
    const stream = of({ data: dossier() });
    const handler = { handle: () => stream };
    expect(
      new RestrictedFieldsInterceptor().intercept(
        contextFor({ role: 'admin', permissions: [] }),
        handler,
      ),
    ).toBe(stream);
    expect(new RestrictedFieldsInterceptor().intercept(contextFor(undefined), handler)).toBe(
      stream,
    );
  });
});
