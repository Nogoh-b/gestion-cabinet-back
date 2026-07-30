import { ForbiddenException } from '@nestjs/common';
import { GenericWriteService } from './generic-write.service';

describe('GenericWriteService - IA en lecture seule', () => {
  it('refuse tout plan avant de créer une connexion ou une transaction', async () => {
    const dataSource = {
      createQueryRunner: jest.fn(),
    };
    const registry = {
      getHandler: jest.fn(),
    };
    const service = new GenericWriteService(
      dataSource as any,
      registry as any,
    );

    await expect(
      service.executePlan(
        {
          transaction: true,
          operations: [
            {
              operation: 'CREATE',
              entity: 'dossiers',
              fields: { status: 'ACTIVE' },
            },
          ],
        } as any,
        '42',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(registry.getHandler).not.toHaveBeenCalled();
  });
});
