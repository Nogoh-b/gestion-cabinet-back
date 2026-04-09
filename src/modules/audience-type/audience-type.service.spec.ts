import { Test, TestingModule } from '@nestjs/testing';
import { AudienceTypeService } from './audience-type.service';

describe('AudienceTypeService', () => {
  let service: AudienceTypeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AudienceTypeService],
    }).compile();

    service = module.get<AudienceTypeService>(AudienceTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
