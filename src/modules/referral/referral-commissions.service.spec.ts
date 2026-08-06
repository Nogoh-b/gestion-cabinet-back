import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import {
  CommissionPaymentMethod,
  CommissionStatus,
  ReferralCommission,
} from './entities/referral-commission.entity';
import { ReferralCommissionsService } from './referral-commissions.service';

describe('ReferralCommissionsService - approbation et paiement', () => {
  const commissionRepository = {
    save: jest.fn(async (value) => value),
    softDelete: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === User ? userRepository : commissionRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) =>
      callback(manager),
    ),
  };
  const outbox = {
    enqueue: jest.fn(),
  };
  const audit = {
    append: jest.fn(async () => ({
      id: 'audit-referral-commission-1',
    })),
  };
  let service: ReferralCommissionsService;

  const commission = (
    status: CommissionStatus,
  ): ReferralCommission =>
    ({
      id: 31,
      tenant_id: 2,
      dossier_referral_id: 8,
      dossier_referral: {
        id: 8,
        dossier_id: 12,
        referrer: {
          id: 5,
          company_name: 'Apporteur Test',
        },
      },
      facture_id: '8b3eed52-62aa-4d22-961a-270576136be1',
      paiement_id: null,
      amount: 250000,
      status,
      calculation_date: new Date('2026-01-15'),
      calculated_by_id: 4,
      approved_by_id:
        status === CommissionStatus.APPROVED ? 5 : null,
      payment_date: null,
      payment_method: null,
      payment_reference: null,
    }) as unknown as ReferralCommission;

  beforeEach(() => {
    jest.clearAllMocks();
    commissionRepository.save.mockImplementation(
      async (value) => value,
    );
    service = new ReferralCommissionsService(
      {} as any,
      commissionRepository as any,
      {} as any,
      {} as any,
      {} as any,
      userRepository as any,
      dataSource as any,
      outbox as any,
      audit as any,
    );
  });

  it('interdit au calculateur d’approuver sa commission', async () => {
    const value = commission(CommissionStatus.CALCULATED);
    jest
      .spyOn(service as any, 'lockCommission')
      .mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 4 });

    await expect(
      runWithTenantContext(2, () =>
        service.approve(value.id, { userId: 4 }),
      ),
    ).rejects.toThrow('propre commission');
  });

  it('approuve avec un acteur distinct et écrit l’audit', async () => {
    const value = commission(CommissionStatus.CALCULATED);
    jest
      .spyOn(service as any, 'lockCommission')
      .mockResolvedValue(value);
    jest.spyOn(service, 'findOne').mockImplementation(async () => value);
    userRepository.findOne.mockResolvedValue({ id: 5 });

    const result = await runWithTenantContext(2, () =>
      service.approve(value.id, { userId: 5 }),
    );

    expect(result.status).toBe(CommissionStatus.APPROVED);
    expect(result.approved_by_id).toBe(5);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'referral_commission.approved',
      }),
    );
  });

  it('interdit à l’approbateur de payer', async () => {
    const value = commission(CommissionStatus.APPROVED);
    jest
      .spyOn(service as any, 'lockCommission')
      .mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({ id: 5 });

    await expect(
      runWithTenantContext(2, () =>
        service.pay(
          value.id,
          {
            paymentMethod:
              CommissionPaymentMethod.BANK_TRANSFER,
            paymentReference: 'VIR-COM-001',
          },
          { userId: 5 },
        ),
      ),
    ).rejects.toThrow('distinct');
  });

  it('paie via une outbox et fige la référence', async () => {
    const value = commission(CommissionStatus.APPROVED);
    jest
      .spyOn(service as any, 'lockCommission')
      .mockResolvedValue(value);
    jest.spyOn(service, 'findOne').mockImplementation(async () => value);
    userRepository.findOne.mockResolvedValue({ id: 6 });

    const result = await runWithTenantContext(2, () =>
      service.pay(
        value.id,
        {
          paymentMethod:
            CommissionPaymentMethod.MOBILE_MONEY,
          paymentReference: 'MM-COM-002',
          paymentDate: '2026-01-20T10:00:00.000Z',
        },
        { userId: 6 },
      ),
    );

    expect(result.status).toBe(CommissionStatus.PAID);
    expect(result.payment_reference).toBe('MM-COM-002');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'referral_commission.paid',
        payload: expect.objectContaining({
          commissionId: value.id,
          paymentReference: 'MM-COM-002',
        }),
      }),
    );
  });

  it('interdit toute modification après approbation', async () => {
    const value = commission(CommissionStatus.APPROVED);
    jest
      .spyOn(service as any, 'lockCommission')
      .mockResolvedValue(value);

    await expect(
      runWithTenantContext(2, () =>
        service.update(
          value.id,
          { amount: 300000 },
          { userId: 6 },
        ),
      ),
    ).rejects.toThrow('immuable');
  });
});
