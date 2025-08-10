import { Test, TestingModule } from '@nestjs/testing';
import { DivivionService } from './divivion.service';

describe('DivivionService', () => {
  let service: DivivionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DivivionService],
    }).compile();

    service = module.get<DivivionService>(DivivionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
