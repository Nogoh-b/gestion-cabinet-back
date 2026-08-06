import { WsException } from '@nestjs/websockets';
import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { MainGateway } from './main.gateway';

describe('MainGateway notification permissions', () => {
  const client = (permissions: string[] = []) =>
    ({
      data: { user: { id: 7, tenantId: 42, permissions } },
      emit: jest.fn(),
    }) as any;

  it('refuse une notification directe sans permission explicite', async () => {
    const gateway = Object.create(MainGateway.prototype) as MainGateway;

    await expect(
      gateway.handleSendNotification(client(), {
        user_ids: [8],
        type: NotificationType.MESSAGE,
        title: 'Test',
      }),
    ).rejects.toBeInstanceOf(WsException);
  });

  it('refuse une diffusion cabinet sans permission explicite', async () => {
    const gateway = Object.create(MainGateway.prototype) as MainGateway;

    await expect(
      gateway.handleBroadcastNotification(client(['send_notification']), {
        type: NotificationType.MESSAGE,
        title: 'Test',
      }),
    ).rejects.toBeInstanceOf(WsException);
  });

  it('persiste une notification autorisée au lieu d’émettre un message volatil', async () => {
    const gateway = Object.create(MainGateway.prototype) as any;
    gateway.notificationService = {
      createBulk: jest.fn().mockResolvedValue([{ id: 1 }]),
    };
    gateway.runForSocket = (_client: any, action: () => any) => action();
    const socket = client(['send_notification']);

    await gateway.handleSendNotification(socket, {
      user_ids: [8],
      type: NotificationType.MESSAGE,
      title: 'Test',
      save_to_db: false,
    });

    expect(gateway.notificationService.createBulk).toHaveBeenCalledWith(
      expect.objectContaining({ user_ids: [8], title: 'Test' }),
      7,
    );
    expect(socket.emit).toHaveBeenCalledWith(
      'notification_sent',
      expect.objectContaining({ success: true, saved: 1 }),
    );
  });
});
