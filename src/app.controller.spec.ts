import { of } from 'rxjs';
import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const client = { send: jest.fn() };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DataSource, useValue: {} },
        { provide: 'USER_SERVICE', useValue: client },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('relay', () => {
    it('relaie le message au microservice et renvoie sa réponse', async () => {
      client.send.mockReturnValue(of({ ok: true }));

      await expect(appController.handleTcpRelay({ a: 1 })).resolves.toEqual({ ok: true });
      expect(client.send).toHaveBeenCalledWith({ cmd: 'process-data' }, { a: 1 });
    });
  });
});
