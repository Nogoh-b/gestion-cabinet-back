import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { runWithTenantContext } from '../tenant/tenant.context';
import { GenericWriteService } from './generic-write.service';

describe('GenericWriteService - périmètre du cabinet', () => {
  // L'IA écrit (après confirmation et contrôle des droits par
  // AiDatabasePermissionService.assertCanWritePlan) ; le service refuse
  // encore, avant toute connexion, ce qui sortirait du cabinet courant.
  const setup = () => {
    const dataSource = { createQueryRunner: jest.fn() };
    const registry = { getHandler: jest.fn() };
    return { dataSource, registry, service: new GenericWriteService(dataSource as any, registry as any) };
  };

  it('refuse de modifier un autre cabinet avant de créer une connexion', async () => {
    const { dataSource, registry, service } = setup();
    await expect(
      runWithTenantContext(7, () =>
        service.executePlan(
          { transaction: true, operations: [{ operation: 'UPDATE', entity: 'cabinets', entityId: 8, fields: { name: 'X' } }] } as any,
          '42',
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(registry.getHandler).not.toHaveBeenCalled();
  });

  it('refuse de créer ou supprimer un cabinet depuis l’assistant', async () => {
    const { dataSource, service } = setup();
    await expect(
      runWithTenantContext(7, () =>
        service.executePlan(
          { transaction: true, operations: [{ operation: 'CREATE', entity: 'cabinets', fields: { name: 'X' } }] } as any,
          '42',
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
