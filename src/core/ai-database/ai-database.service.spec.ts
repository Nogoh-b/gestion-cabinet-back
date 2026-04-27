import { Test, TestingModule } from '@nestjs/testing';
import { AiDatabaseService } from './ai-database.service';

describe('AiDatabaseService', () => {
  let service: AiDatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiDatabaseService],
    }).compile();

    service = module.get<AiDatabaseService>(AiDatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
