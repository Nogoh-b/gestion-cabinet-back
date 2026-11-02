import { NotFoundException } from '@nestjs/common';
import {
  buildTenantMutationCriteria,
  protectTenantSave,
} from './tenant-repository.patch';

describe('tenant repository mutation guards', () => {
  it('ajoute le tenant aux tableaux d’identifiants de mutation', () => {
    const criteria = buildTenantMutationCriteria([1, 2, 3], 42);

    expect(criteria.tenant_id).toBe(42);
    expect(criteria.id).toMatchObject({
      _type: 'in',
      _value: [1, 2, 3],
    });
  });

  it('refuse immédiatement une entité portant un autre tenant', async () => {
    const repository = {
      metadata: { getEntityIdMap: jest.fn() },
    };
    const findOne = jest.fn();

    await expect(
      protectTenantSave(
        repository as any,
        findOne as any,
        { id: 7, tenant_id: 99 },
        42,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('refuse un save partiel qui cible en base une ligne d’un autre cabinet', async () => {
    const repository = {
      metadata: { getEntityIdMap: jest.fn().mockReturnValue({ id: 7 }) },
    };
    const findOne = jest.fn().mockResolvedValue({ id: 7, tenant_id: 99 });

    await expect(
      protectTenantSave(
        repository as any,
        findOne as any,
        { id: 7 },
        42,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('injecte le tenant sur une nouvelle entité sans identifiant', async () => {
    const repository = {
      metadata: { getEntityIdMap: jest.fn().mockReturnValue(undefined) },
    };
    const entity: any = { name: 'nouvelle ressource' };
    const findOne = jest.fn();

    await protectTenantSave(repository as any, findOne as any, entity, 42);

    expect(entity.tenant_id).toBe(42);
    expect(findOne).not.toHaveBeenCalled();
  });
});
