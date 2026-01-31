import { Test, TestingModule } from '@nestjs/testing';
import { JurisdictionService } from './jurisdiction.service';

describe('JurisdictionService', () => {
  let service: JurisdictionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JurisdictionService],
    }).compile();

    service = module.get<JurisdictionService>(JurisdictionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
