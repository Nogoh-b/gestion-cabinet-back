import { describe, expect, it, jest } from '@jest/globals';
import { PermissionSeeder } from 'src/core/auth/seeders/permission.seeder';
import {
  ROLES_CONFIG,
  RoleSeeder,
} from 'src/core/auth/seeders/role.seeder';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Repository } from 'typeorm';

import { Cabinet } from './entities/cabinet.entity';
import { TenantSeederService } from './tenant-seeder.service';

describe('TenantSeederService', () => {
  it("réconcilie l'IAM de chaque cabinet, y compris le tenant 1", async () => {
    const cabinetRepo = {
      find: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    } as unknown as Repository<Cabinet>;
    const permissionSeeder = {
      seed: jest
        .fn()
        .mockResolvedValueOnce(['manage_roles'])
        .mockResolvedValueOnce([]),
    } as unknown as PermissionSeeder;
    const roleSeeder = {
      seed: jest.fn().mockResolvedValue(undefined),
    } as unknown as RoleSeeder;
    const visitedTenants: number[] = [];
    const tenantContext = {
      run: jest.fn(async (tenantId: number, work: () => Promise<void>) => {
        visitedTenants.push(tenantId);
        return work();
      }),
    } as unknown as TenantContext;

    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    const service = new TenantSeederService(
      tenantContext,
      dataSource as never,
      permissionSeeder,
      roleSeeder,
      cabinetRepo,
    );

    await service.syncIamReferenceDataForAllTenants();

    expect(visitedTenants).toEqual([1, 2]);
    expect(permissionSeeder.seed).toHaveBeenCalledTimes(2);
    expect(roleSeeder.seed).toHaveBeenNthCalledWith(1, ['manage_roles']);
    expect(roleSeeder.seed).toHaveBeenNthCalledWith(2, []);
  });

  it('continue avec les autres cabinets si une réconciliation échoue', async () => {
    const cabinetRepo = {
      find: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    } as unknown as Repository<Cabinet>;
    const permissionSeeder = {
      seed: jest
        .fn()
        .mockRejectedValueOnce(new Error('tenant incomplet'))
        .mockResolvedValueOnce([]),
    } as unknown as PermissionSeeder;
    const roleSeeder = {
      seed: jest.fn().mockResolvedValue(undefined),
    } as unknown as RoleSeeder;
    const tenantContext = {
      run: jest.fn((_tenantId: number, work: () => Promise<void>) => work()),
    } as unknown as TenantContext;
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    const service = new TenantSeederService(
      tenantContext,
      dataSource as never,
      permissionSeeder,
      roleSeeder,
      cabinetRepo,
    );

    await expect(
      service.syncIamReferenceDataForAllTenants(),
    ).resolves.toBeUndefined();

    expect(permissionSeeder.seed).toHaveBeenCalledTimes(2);
    expect(roleSeeder.seed).toHaveBeenCalledTimes(1);
  });

  it("n'exécute aucun seeder lorsque tous les rôles système existent", async () => {
    const cabinetRepo = {
      find: jest.fn().mockResolvedValue([{ id: 1 }]),
    } as unknown as Repository<Cabinet>;
    const permissionSeeder = {
      seed: jest.fn(),
    } as unknown as PermissionSeeder;
    const roleSeeder = {
      seed: jest.fn(),
    } as unknown as RoleSeeder;
    const tenantContext = {
      run: jest.fn(),
    } as unknown as TenantContext;
    const dataSource = {
      query: jest.fn().mockResolvedValue(
        ROLES_CONFIG.map(({ code }) => ({ tenant_id: 1, code })),
      ),
    };
    const service = new TenantSeederService(
      tenantContext,
      dataSource as never,
      permissionSeeder,
      roleSeeder,
      cabinetRepo,
    );

    await service.syncIamReferenceDataForAllTenants();

    expect(tenantContext.run).not.toHaveBeenCalled();
    expect(permissionSeeder.seed).not.toHaveBeenCalled();
    expect(roleSeeder.seed).not.toHaveBeenCalled();
  });
});
