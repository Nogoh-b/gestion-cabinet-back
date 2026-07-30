import { NotFoundException } from '@nestjs/common';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { NotificationService } from './notification.service';
import { NotificationType } from './enum/notification-type.enum';

describe('NotificationService tenant boundaries', () => {
  it('refuse tout lot contenant un destinataire d’un autre cabinet avant écriture', async () => {
    const userRepository = {
      find: jest.fn().mockResolvedValue([{ id: 2 }]),
      findOne: jest.fn(),
    };
    const dataSource = {
      createQueryRunner: jest.fn(),
    };
    const service = new NotificationService(
      {} as any,
      {} as any,
      userRepository as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
    );

    await expect(
      runWithTenantContext(42, () =>
        service.createBulk(
          {
            user_ids: [2, 99],
            type: NotificationType.MESSAGE,
            title: 'Confidentiel',
          },
          2,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(userRepository.find).toHaveBeenCalledWith({
      where: {
        id: expect.anything(),
        tenant_id: 42,
      },
      select: ['id'],
    });
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
