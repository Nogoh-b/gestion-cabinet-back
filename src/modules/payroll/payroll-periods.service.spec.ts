import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import {
  PayrollPeriod,
  PayrollPeriodStatus,
} from './entities/payroll-period.entity';
import { PayslipStatus } from './entities/payslip.entity';
import { PayrollPeriodsService } from './payroll-periods.service';

describe('PayrollPeriodsService - clôture stricte', () => {
  const periodRepository = {
    save: jest.fn(async (value) => value),
    softDelete: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === User ? userRepository : periodRepository,
    ),
  };
  // Brouillons de la période relus par la clôture (validés un par un).
  const payslipRepository = { find: jest.fn(async () => [] as any[]) };
  const payslips = { validate: jest.fn(async () => undefined) };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
    getRepository: jest.fn(() => payslipRepository),
  };
  const audit = {
    append: jest.fn(),
  };
  let service: PayrollPeriodsService;

  const period = (
    status: PayrollPeriodStatus,
    payslipStatuses: PayslipStatus[],
  ): PayrollPeriod =>
    ({
      id: 9,
      tenant_id: 2,
      label: 'Paie juillet 2026',
      status,
      start_date: new Date('2026-07-01'),
      end_date: new Date('2026-07-31'),
      payslips: payslipStatuses.map((payslipStatus, index) => ({
        id: index + 1,
        status: payslipStatus,
      })),
    }) as PayrollPeriod;

  beforeEach(() => {
    jest.clearAllMocks();
    periodRepository.save.mockImplementation(async (value) => value);
    userRepository.findOne.mockResolvedValue({ id: 12 });
    service = new PayrollPeriodsService(
      {} as any,
      periodRepository as any,
      {} as any,
      {} as any,
      dataSource as any,
      audit as any,
      { get: () => payslips } as any,
    );
    payslipRepository.find.mockResolvedValue([]);
    payslips.validate.mockResolvedValue(undefined);
  });

  it('valide les brouillons puis clôture la période', async () => {
    payslipRepository.find.mockResolvedValue([{ id: 2 }]);
    // Après validation, la période relue n'a plus de brouillon.
    const value = period(PayrollPeriodStatus.DRAFT, [
      PayslipStatus.VALIDATED,
      PayslipStatus.VALIDATED,
    ]);
    jest.spyOn(service as any, 'lockPeriod').mockResolvedValue(value);

    const result = await runWithTenantContext(2, () =>
      service.close(value.id, { userId: 12 }),
    );

    expect(payslips.validate).toHaveBeenCalledWith(2, { userId: 12 });
    expect(result.status).toBe(PayrollPeriodStatus.VALIDATED);
    expect(result.validated).toBe(1);
  });

  it('s’arrête, avec la raison, si un brouillon ne peut pas être validé', async () => {
    payslipRepository.find.mockResolvedValue([
      { id: 2, employee: { user: { full_name: 'Thierry Fotso' } } },
    ]);
    payslips.validate.mockRejectedValue(
      new Error('Le préparateur ne peut pas valider son propre bulletin'),
    );
    const value = period(PayrollPeriodStatus.DRAFT, [PayslipStatus.DRAFT]);
    jest.spyOn(service as any, 'lockPeriod').mockResolvedValue(value);

    await expect(
      runWithTenantContext(2, () =>
        service.close(value.id, { userId: 12 }),
      ),
    ).rejects.toThrow(/Thierry Fotso : Le préparateur ne peut pas valider/);
    expect(periodRepository.save).not.toHaveBeenCalled();
  });

  it('clôture atomiquement une période déjà entièrement validée', async () => {
    const value = period(PayrollPeriodStatus.DRAFT, [
      PayslipStatus.VALIDATED,
      PayslipStatus.VALIDATED,
    ]);
    jest.spyOn(service as any, 'lockPeriod').mockResolvedValue(value);

    const result = await runWithTenantContext(2, () =>
      service.close(value.id, { userId: 12 }),
    );

    expect(result.status).toBe(PayrollPeriodStatus.VALIDATED);
    expect(result.payslips_count).toBe(2);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: 'payroll_period.closed' }),
    );
  });

  it('ne marque la période payée que lorsque tous les bulletins le sont', async () => {
    const value = period(PayrollPeriodStatus.VALIDATED, [
      PayslipStatus.PAID,
      PayslipStatus.VALIDATED,
    ]);
    jest.spyOn(service as any, 'lockPeriod').mockResolvedValue(value);

    await expect(
      runWithTenantContext(2, () =>
        service.markPaid(value.id, { userId: 12 }),
      ),
    ).rejects.toThrow('Tous les bulletins');
  });

  it('verrouille définitivement une période marquée payée', async () => {
    const value = period(PayrollPeriodStatus.VALIDATED, [
      PayslipStatus.PAID,
      PayslipStatus.PAID,
    ]);
    jest.spyOn(service as any, 'lockPeriod').mockResolvedValue(value);

    const result = await runWithTenantContext(2, () =>
      service.markPaid(value.id, { userId: 12 }),
    );

    expect(result.status).toBe(PayrollPeriodStatus.PAID);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: 'payroll_period.paid' }),
    );
  });
});
