import { of } from 'rxjs';

import { AppController } from './app.controller';

describe('AppController', () => {
  it('relaie seulement les messages TCP au service interne', async () => {
    const client = {
      send: jest.fn().mockReturnValue(of({ accepted: true })),
    };
    const controller = new AppController(client as any);

    await expect(
      controller.handleTcpRelay({ dossierId: 12 }),
    ).resolves.toEqual({ accepted: true });
    expect(client.send).toHaveBeenCalledWith(
      { cmd: 'process-data' },
      { dossierId: 12 },
    );
  });
});
