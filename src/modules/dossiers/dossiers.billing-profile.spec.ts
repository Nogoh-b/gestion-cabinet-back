import { describe, expect, it, jest } from '@jest/globals';
import { BillingMode } from 'src/modules/case-workflow/case-workflow.enums';
import { DossiersService } from './dossiers.service';

jest.mock('src/core/tenant/tenant.context', () => ({
  getCurrentTenantId: () => 7,
}));

describe('DossiersService - profil de facturation initial', () => {
  it('enregistre une configuration incomplète sans inventer de montant', async () => {
    const create = jest.fn((value) => value);
    const save = jest.fn(async (value) => value);
    const service = Object.create(DossiersService.prototype) as DossiersService;
    Object.assign(service as object, {
      billingProfileRepository: {
        findOne: jest.fn(async () => null),
        create,
        save,
      },
      cabinetRepository: {
        findOne: jest.fn(async () => ({
          currency: 'XAF',
          default_tva_rate: 19.25,
          dossier_opening_fee_enabled: true,
          dossier_opening_fee: 15000,
        })),
      },
    });

    await (
      service as unknown as {
        saveInitialBillingProfile(
          dossier: { id: number; procedure_costs: number | null },
          initial: Record<string, unknown>,
        ): Promise<void>;
      }
    ).saveInitialBillingProfile(
      { id: 42, procedure_costs: 25000 },
      {
        mode: BillingMode.MIXED,
        fixed_fee: 500000,
        result_fee_enabled: true,
        rebill_expenses: true,
        rebill_disbursements: true,
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 7,
        dossier_id: 42,
        mode: BillingMode.MIXED,
        fixed_fee: 500000,
        hourly_rate: null,
        opening_fee: 25000,
        opening_fee_enabled: true,
        result_fee_enabled: true,
        result_fee_rate: null,
        is_confirmed: false,
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('ne bloque pas le dossier si le profil ne peut pas être enregistré', async () => {
    const service = Object.create(DossiersService.prototype) as DossiersService;
    Object.assign(service as object, {
      billingProfileRepository: {
        findOne: jest.fn(async () => null),
        create: jest.fn((value) => value),
        save: jest.fn(async () => {
          throw new Error('base indisponible');
        }),
      },
      cabinetRepository: {
        findOne: jest.fn(async () => ({ currency: 'XAF' })),
      },
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      (
        service as unknown as {
          saveInitialBillingProfile(
            dossier: { id: number; procedure_costs: number | null },
            initial: Record<string, unknown>,
          ): Promise<void>;
        }
      ).saveInitialBillingProfile(
        { id: 43, procedure_costs: null },
        { mode: BillingMode.FIXED },
      ),
    ).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
