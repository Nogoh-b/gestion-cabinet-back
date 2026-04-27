import { Test, TestingModule } from '@nestjs/testing';
import { AiDatabaseController } from './ai-database.controller';
import { AiDatabaseService } from './ai-database.service';

describe('AiDatabaseController', () => {
  let controller: AiDatabaseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiDatabaseController],
      providers: [AiDatabaseService],
    }).compile();

    controller = module.get<AiDatabaseController>(AiDatabaseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
