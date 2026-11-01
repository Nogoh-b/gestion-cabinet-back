import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import {
  PayrollPeriodStatus,
} from './entities/payroll-period.entity';
import {
  Payslip,
  PayslipPaymentMethod,
  PayslipStatus,
} from './entities/payslip.entity';
import { PayslipsService } from './payslips.service';

describe('PayslipsService - séparation préparation/validation/paiement', () => {
  const payslipRepository = {
    save: jest.fn(async (value) => value),
    find: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === User ? userRepository : payslipRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };
  const outbox = {
    enqueue: jest.fn(),
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-payslip-1' })),
  };
  const calculator = {
    computeTotals: jest.fn(() => ({
      gross_amount: 500000,
      net_amount: 420000,
    })),
  };
  let service: PayslipsService;

  const payslip = (status: PayslipStatus): Payslip =>
    ({
      id: 17,
      tenant_id: 2,
      employee_id: 31,
      employee: { id: 31, full_name: 'Salarié Test' },
      period_id: 8,
      period: {
        id: 8,
        label: 'Paie juillet 2026',
        status:
          status === PayslipStatus.VALIDATED
            ? PayrollPeriodStatus.VALIDATED
            : PayrollPeriodStatus.DRAFT,
      },
      gross_amount: 500000,
      net_amount: 420000,
      total_employer_charges: 50000,
      status,
      prepared_by_id: 4,
      validated_by_id:
        status === PayslipStatus.VALIDATED ? 5 : null,
      lines: [],
    }) as unknown as Payslip;

  beforeEach(() => {
    jest.clearAllMocks();
    payslipRepository.save.mockImplementation(async (value) => value);
    (userRepository as any).manager = manager;
    service = new PayslipsService(
      {} as any,
      payslipRepository as any,
      {} as any,
      {} as any,
      userRepository as any,
      {} as any,
      calculator as any,
      {} as any,
      dataSource as any,
      outbox as any,
      audit as any,
    );
  });

  it('interdit au préparateur de valider son propre bulletin', async () => {
    const value = payslip(PayslipStatus.DRAFT);
    jest.spyOn(service as any, 'lockPayslip').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 4 });

    await expect(
      runWithTenantContext(2, () =>
        service.validate(value.id, { userId: 4 }),
      ),
    ).rejects.toThrow('préparateur');
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('valide sous verrou avec un acteur distinct et fige un snapshot', async () => {
    const value = payslip(PayslipStatus.DRAFT);
    jest.spyOn(service as any, 'lockPayslip').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 5 });

    const result = await runWithTenantContext(2, () =>
      service.validate(value.id, { userId: 5 }),
    );

    expect(result.status).toBe(PayslipStatus.VALIDATED);
    expect(result.validated_by_id).toBe(5);
    expect(result.snapshot).toEqual(
      expect.objectContaining({ gross_amount: 500000 }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: 'payslip.validated' }),
    );
  });

  it('interdit au validateur d’enregistrer aussi le paiement', async () => {
    const value = payslip(PayslipStatus.VALIDATED);
    jest.spyOn(service as any, 'lockPayslip').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 5 });

    await expect(
      runWithTenantContext(2, () =>
        service.pay(
          value.id,
          {
            paymentMethod: PayslipPaymentMethod.BANK_TRANSFER,
            paymentReference: 'VIR-2026-007',
          },
          { userId: 5 },
        ),
      ),
    ).rejects.toThrow('distinct du validateur');
  });

  it('paie transactionnellement et publie un événement durable', async () => {
    const value = payslip(PayslipStatus.VALIDATED);
    jest.spyOn(service as any, 'lockPayslip').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 6 });

    const result = await runWithTenantContext(2, () =>
      service.pay(
        value.id,
        {
          paymentMethod: PayslipPaymentMethod.BANK_TRANSFER,
          paymentReference: 'VIR-2026-008',
          paymentDate: '2026-07-28T10:00:00.000Z',
        },
        { userId: 6 },
      ),
    );

    expect(result.status).toBe(PayslipStatus.PAID);
    expect(result.payment_reference).toBe('VIR-2026-008');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'payslip.paid',
      }),
    );
  });

  it('limite la consultation personnelle aux bulletins payés', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 7,
      employee: { id: 31 },
    });
    payslipRepository.find.mockResolvedValue([]);

    await runWithTenantContext(2, () =>
      service.findOwn({ userId: 7 }),
    );

    expect(payslipRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee_id: 31,
          tenant_id: 2,
          status: PayslipStatus.PAID,
        }),
      }),
    );
  });
});
