import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import {
  ContributionBase,
  ContributionPayer,
  PayrollContribution,
  PayrollContributionStatus,
} from './entities/payroll-contribution.entity';
import { PayrollContributionsService } from './payroll-contributions.service';

describe('PayrollContributionsService - barèmes versionnés', () => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const contributionRepository = {
    save: jest.fn(async (value) => value),
    createQueryBuilder: jest.fn(() => queryBuilder),
    softDelete: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === User ? userRepository : contributionRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };
  const audit = {
    append: jest.fn(),
  };
  let service: PayrollContributionsService;

  const contribution = (
    status: PayrollContributionStatus,
    version = 2,
  ): PayrollContribution =>
    ({
      id: version,
      tenant_id: 2,
      code: 'CNPS_TEST',
      version,
      label: 'CNPS test',
      rate: 4.2,
      base_type: ContributionBase.GROSS,
      payer: ContributionPayer.EMPLOYEE,
      ceiling: 750000,
      account_number: '431',
      sort_order: 10,
      status,
      is_active: status === PayrollContributionStatus.PUBLISHED,
      valid_from: new Date(
        version === 1 ? '2025-01-01' : '2026-01-01',
      ),
      valid_until: null,
    }) as unknown as PayrollContribution;

  beforeEach(() => {
    jest.clearAllMocks();
    contributionRepository.save.mockImplementation(
      async (value) => value,
    );
    (userRepository as any).manager = manager;
    userRepository.findOne.mockResolvedValue({ id: 10 });
    service = new PayrollContributionsService(
      contributionRepository as any,
      userRepository as any,
      dataSource as any,
      audit as any,
    );
  });

  it('rend une version publiée immuable', async () => {
    const published = contribution(
      PayrollContributionStatus.PUBLISHED,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(published);

    await expect(
      runWithTenantContext(2, () =>
        service.update(published.id, { rate: 5 }),
      ),
    ).rejects.toThrow('immuable');
  });

  it('publie la nouvelle version et retire atomiquement la précédente', async () => {
    const draft = contribution(PayrollContributionStatus.DRAFT, 2);
    const previous = contribution(
      PayrollContributionStatus.PUBLISHED,
      1,
    );
    jest
      .spyOn(service as any, 'lockContribution')
      .mockResolvedValue(draft);
    queryBuilder.getOne.mockResolvedValue(previous);

    const result = await runWithTenantContext(2, () =>
      service.publish(draft.id, { userId: 10 }),
    );

    expect(result.status).toBe(
      PayrollContributionStatus.PUBLISHED,
    );
    expect(previous.status).toBe(
      PayrollContributionStatus.RETIRED,
    );
    expect(previous.valid_until).toEqual(
      new Date('2025-12-31T00:00:00.000Z'),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'payroll_contribution.published',
      }),
    );
  });

  it('retire une version publiée avec un motif obligatoire', async () => {
    const published = contribution(
      PayrollContributionStatus.PUBLISHED,
    );
    jest
      .spyOn(service as any, 'lockContribution')
      .mockResolvedValue(published);

    const result = await runWithTenantContext(2, () =>
      service.retire(
        published.id,
        {
          reason: 'Remplacement réglementaire contrôlé',
          validUntil: '2026-12-31',
        },
        { userId: 10 },
      ),
    );

    expect(result.status).toBe(
      PayrollContributionStatus.RETIRED,
    );
    expect(result.retirement_reason).toBe(
      'Remplacement réglementaire contrôlé',
    );
  });
});
