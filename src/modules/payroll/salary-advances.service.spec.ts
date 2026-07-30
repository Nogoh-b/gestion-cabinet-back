import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import { PayslipPaymentMethod } from './entities/payslip.entity';
import {
  SalaryAdvance,
  SalaryAdvanceStatus,
} from './entities/salary-advance.entity';
import { SalaryAdvancesService } from './salary-advances.service';

describe('SalaryAdvancesService - approbation et versement', () => {
  const advanceRepository = {
    save: jest.fn(async (value) => value),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === User ? userRepository : advanceRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };
  const outbox = {
    enqueue: jest.fn(),
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-advance-1' })),
  };
  let service: SalaryAdvancesService;

  const advance = (
    status: SalaryAdvanceStatus,
  ): SalaryAdvance =>
    ({
      id: 14,
      tenant_id: 2,
      employee_id: 21,
      employee: {
        id: 21,
        full_name: 'Salarié Test',
        salary: 500000,
      },
      amount: 100000,
      recovered_amount: 0,
      status,
      requested_by_id: 4,
      approved_by_id:
        status === SalaryAdvanceStatus.APPROVED ? 5 : null,
    }) as unknown as SalaryAdvance;

  beforeEach(() => {
    jest.clearAllMocks();
    advanceRepository.save.mockImplementation(async (value) => value);
    (userRepository as any).manager = manager;
    service = new SalaryAdvancesService(
      {} as any,
      advanceRepository as any,
      {} as any,
      userRepository as any,
      dataSource as any,
      outbox as any,
      audit as any,
    );
  });

  it('interdit l’auto-approbation par le demandeur', async () => {
    const value = advance(SalaryAdvanceStatus.PENDING);
    jest
      .spyOn(service as any, 'lockAdvance')
      .mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 4 });

    await expect(
      runWithTenantContext(2, () =>
        service.approve(value.id, { userId: 4 }),
      ),
    ).rejects.toThrow('propre avance');
  });

  it('approuve avec un acteur distinct et audit', async () => {
    const value = advance(SalaryAdvanceStatus.PENDING);
    jest
      .spyOn(service as any, 'lockAdvance')
      .mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 5 });

    const result = await runWithTenantContext(2, () =>
      service.approve(value.id, { userId: 5 }),
    );

    expect(result.status).toBe(SalaryAdvanceStatus.APPROVED);
    expect(result.approved_by_id).toBe(5);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: 'salary_advance.approved' }),
    );
  });

  it('interdit à l’approbateur d’enregistrer le versement', async () => {
    const value = advance(SalaryAdvanceStatus.APPROVED);
    jest
      .spyOn(service as any, 'lockAdvance')
      .mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 5 });

    await expect(
      runWithTenantContext(2, () =>
        service.pay(
          value.id,
          {
            paymentMethod: PayslipPaymentMethod.BANK_TRANSFER,
            paymentReference: 'VIR-ADV-001',
          },
          { userId: 5 },
        ),
      ),
    ).rejects.toThrow('distinct');
  });

  it('verse une avance approuvée via l’outbox', async () => {
    const value = advance(SalaryAdvanceStatus.APPROVED);
    jest
      .spyOn(service as any, 'lockAdvance')
      .mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 6 });

    const result = await runWithTenantContext(2, () =>
      service.pay(
        value.id,
        {
          paymentMethod: PayslipPaymentMethod.MOBILE_MONEY,
          paymentReference: 'MM-ADV-002',
          paymentDate: '2026-07-28T10:00:00.000Z',
        },
        { userId: 6 },
      ),
    );

    expect(result.status).toBe(SalaryAdvanceStatus.PAID);
    expect(result.payment_reference).toBe('MM-ADV-002');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'salary_advance.paid',
      }),
    );
  });

  it('limite la consultation personnelle aux avances du collaborateur rattaché', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 7,
      employee: { id: 21 },
    });
    advanceRepository.find.mockResolvedValue([]);

    await runWithTenantContext(2, () =>
      service.findOwn({ userId: 7 }),
    );

    expect(advanceRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employee_id: 21,
          tenant_id: 2,
        },
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'salary_advance.own_list_viewed',
        actorId: 7,
      }),
    );
  });

  it('recherche un détail personnel avec le tenant et l’employé dans la même clause', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 7,
      employee: { id: 21 },
    });
    const value = advance(SalaryAdvanceStatus.PAID);
    advanceRepository.findOne.mockResolvedValue(value);

    const result = await runWithTenantContext(2, () =>
      service.findOwnOne(value.id, { userId: 7 }),
    );

    expect(result).toBe(value);
    expect(advanceRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: value.id,
          employee_id: 21,
          tenant_id: 2,
        },
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'salary_advance.own_viewed',
        resourceId: value.id,
      }),
    );
  });
});
