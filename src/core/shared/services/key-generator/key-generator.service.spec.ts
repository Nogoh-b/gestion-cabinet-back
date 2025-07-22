import { Test, TestingModule } from '@nestjs/testing';
import { KeyGeneratorService } from './key-generator.service';

describe('KeyGeneratorService', () => {
  let service: KeyGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeyGeneratorService],
    }).compile();

    service = module.get<KeyGeneratorService>(KeyGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
