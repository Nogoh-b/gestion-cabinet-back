import { TenantSeederService } from './tenant-seeder.service';
describe('Tenant reference initialization', () => {
  const refs = { initializeCabinet: jest.fn(), ensureStandard: jest.fn() };
  beforeEach(() => jest.clearAllMocks());
  it('initializes cabinet #1 with the same selected-profile engine and transaction', async () => {
    const service = new TenantSeederService(refs as any),
      manager = {} as any;
    await service.seedForNewCabinet(1, 'profile-id', manager);
    expect(refs.initializeCabinet).toHaveBeenCalledWith(
      1,
      'profile-id',
      manager,
    );
  });
  it('does not reconcile existing cabinets during startup', async () => {
    const service = new TenantSeederService(refs as any);
    await service.syncIamReferenceDataForAllTenants();
    expect(refs.ensureStandard).toHaveBeenCalledTimes(1);
    expect(refs.initializeCabinet).not.toHaveBeenCalled();
  });
  it('requires explicit cabinet selection for former global backfill commands', async () => {
    const service = new TenantSeederService(refs as any);
    await expect(service.syncReferenceDataForAllTenants()).rejects.toThrow(
      'sélectionner',
    );
    await expect(service.backfillIamDefaultsForAllTenants()).rejects.toThrow(
      'explicite',
    );
    expect(refs.initializeCabinet).not.toHaveBeenCalled();
  });
});
