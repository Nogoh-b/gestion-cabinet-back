/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';
import { PlanQuotaService } from './plan-quota.service';
import { StorageUsageService } from './storage-usage.service';

const GB = 1024 ** 3;

/** Base factice : somme `file_size` par table et par tenant, comme `SELECT SUM(...)`. */
function fakeDb(sizes: Record<string, number>) {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
    return [{ total: String(sizes[`${table}:${params[0]}`] ?? 0) }];
  });
  return { query } as any;
}

describe('StorageUsageService', () => {
  it('counts documents, versions and exports of the cabinet only', async () => {
    const db = fakeDb({
      'document_customer:5': 100,
      'document_customer_versions:5': 40,
      'dossier_exports:5': 10,
      'document_customer:6': 9999,
    });
    const service = new StorageUsageService(db);

    expect(await service.getBreakdown(5)).toEqual({
      documents: 100,
      versions: 40,
      exports: 10,
      extra: {},
      total: 150,
    });
    expect(await service.getUsedBytes(5)).toBe(150);
    // Lignes supprimées logiquement exclues, filtre tenant toujours présent.
    for (const [sql] of db.query.mock.calls) {
      expect(sql).toContain('tenant_id = ?');
      expect(sql).toContain('deleted_at IS NULL');
    }
  });

  it('adds sources registered by other modules (audio recordings)', async () => {
    const service = new StorageUsageService(fakeDb({ 'document_customer:5': 100 }));
    service.registerSource('audience_recordings', async (tenantId) => (tenantId === 5 ? 25 : 0));

    expect(await service.getBreakdown(5)).toEqual(
      expect.objectContaining({ extra: { audience_recordings: 25 }, total: 125 }),
    );
    expect(await service.getUsedBytes(6)).toBe(0);
  });
});

/** Application et affichage du quota partent du même nombre. */
describe('storage quota uses the shared usage', () => {
  function setup(maxGb: number | null, used: number) {
    const usage = { getUsedBytes: jest.fn(async () => used) };
    const cabinetRepo = {
      findOne: jest.fn(async () => ({ activePlan: { name: 'Pro', max_storage_gb: maxGb } })),
    };
    const quota = new PlanQuotaService(cabinetRepo as any, usage as any);
    return { quota, usage };
  }

  it('refuses a file that would exceed the plan, counting everything stored', async () => {
    const { quota, usage } = setup(1, GB - 10);

    await expect(quota.checkStorageLimit(5, 10)).resolves.toBeUndefined();
    await expect(quota.checkStorageLimit(5, 11)).rejects.toBeInstanceOf(ForbiddenException);
    expect(usage.getUsedBytes).toHaveBeenCalledWith(5);
  });

  it('never refuses on an unlimited plan', async () => {
    const { quota, usage } = setup(-1, 50 * GB);

    await expect(quota.checkStorageLimit(5, GB)).resolves.toBeUndefined();
    expect(usage.getUsedBytes).not.toHaveBeenCalled();
  });

  it('reports the same bytes it enforces', async () => {
    const { quota } = setup(2, 3 * GB);
    const status = await quota.getUsageStatus(
      5,
      { employees: 0, clients: 0, dossiers: 0, storageBytes: 3 * GB },
      {} as any,
    );

    expect(status.quota.storage).toEqual(expect.objectContaining({ usedBytes: 3 * GB, exceeded: true }));
    await expect(quota.checkStorageLimit(5, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
