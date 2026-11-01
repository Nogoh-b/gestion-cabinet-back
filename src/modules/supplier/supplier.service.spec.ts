import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { SupplierCategory } from './entities/supplier.entity';
import { SuppliersService } from './supplier.service';

describe('SuppliersService - isolation et conservation', () => {
  const queryBuilder = {
    withDeleted: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getOne: jest.fn(),
  };
  const repository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const branchRepo = { findOne: jest.fn() };
  let service: SuppliersService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.withDeleted.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.getOne.mockResolvedValue(null);
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    repository.create.mockImplementation((value) => ({ ...value }));
    repository.save.mockImplementation(async (value) => value);
    repository.findOne.mockResolvedValue(null);
    branchRepo.findOne.mockResolvedValue({ id: 7, tenant_id: 2 });
    service = new SuppliersService(
      {} as any,
      repository as any,
      branchRepo as any,
    );
  });

  it('crée le fournisseur et résout son agence dans le cabinet courant', async () => {
    const result = await runWithTenantContext(2, () =>
      service.create({
        company_name: 'Prestataire',
        category: SupplierCategory.OTHER,
        branch_id: 7,
      }),
    );

    expect(branchRepo.findOne).toHaveBeenCalledWith({
      where: { id: 7, tenant_id: 2 },
    });
    expect(result.tenant_id).toBe(2);
    expect(result.supplier_code).toBe('SUP-001');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'supplier.tenant_id = :tenantId',
      { tenantId: 2 },
    );
  });

  it('filtre explicitement une lecture par cabinet', async () => {
    repository.findOne.mockResolvedValue({
      id: 4,
      tenant_id: 2,
      status: true,
      invoices: [],
    });

    await runWithTenantContext(2, () => service.findOne(4));

    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 4, tenant_id: 2 },
      }),
    );
  });

  it('désactive un fournisseur sans supprimer son historique', async () => {
    const supplier = {
      id: 4,
      tenant_id: 2,
      status: true,
      invoices: [{ id: 11 }],
    };
    repository.findOne.mockResolvedValue(supplier);

    await runWithTenantContext(2, () => service.remove(4));

    expect(supplier.status).toBe(false);
    expect(repository.save).toHaveBeenCalledWith(supplier);
  });
});
