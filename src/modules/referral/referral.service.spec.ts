import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { ReferrerType } from './entities/referral.entity';
import { ReferrersService } from './referral.service';

describe('ReferrersService - isolation et conservation', () => {
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };
  const employeeRepo = { findOne: jest.fn() };
  const customerRepo = { findOne: jest.fn() };
  let service: ReferrersService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.create.mockImplementation((value) => ({ ...value }));
    repository.save.mockImplementation(async (value) => value);
    repository.count.mockResolvedValue(0);
    repository.findOne.mockResolvedValue(null);
    employeeRepo.findOne.mockResolvedValue({ id: 8, tenant_id: 2 });
    customerRepo.findOne.mockResolvedValue(null);
    service = new ReferrersService(
      {} as any,
      repository as any,
      employeeRepo as any,
      customerRepo as any,
    );
  });

  it("crée l'apporteur interne dans le cabinet courant", async () => {
    const result = await runWithTenantContext(2, () =>
      service.create({
        company_name: 'Collaborateur apporteur',
        referrer_type: ReferrerType.EMPLOYEE,
        is_internal: true,
        employee_id: 8,
      }),
    );

    expect(employeeRepo.findOne).toHaveBeenCalledWith({
      where: { id: 8, tenant_id: 2 },
    });
    expect(repository.count).toHaveBeenCalledWith({
      where: { tenant_id: 2 },
    });
    expect(result.tenant_id).toBe(2);
    expect(result.referrer_code).toBe('REF-2-001');
  });

  it('filtre explicitement une lecture par cabinet', async () => {
    repository.findOne.mockResolvedValue({
      id: 5,
      tenant_id: 2,
      status: true,
      dossier_referrals: [],
    });

    await runWithTenantContext(2, () => service.findOne(5));

    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, tenant_id: 2 },
      }),
    );
  });

  it("désactive l'apporteur sans supprimer ses commissions historiques", async () => {
    const referrer = {
      id: 5,
      tenant_id: 2,
      status: true,
      dossier_referrals: [{ id: 14 }],
    };
    repository.findOne.mockResolvedValue(referrer);

    await runWithTenantContext(2, () => service.remove(5));

    expect(referrer.status).toBe(false);
    expect(repository.save).toHaveBeenCalledWith(referrer);
  });
});
