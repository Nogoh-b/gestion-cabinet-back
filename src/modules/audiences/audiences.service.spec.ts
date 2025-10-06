import { Test, TestingModule } from '@nestjs/testing';
import { AudiencesService } from './audiences.service';

describe('AudiencesService', () => {
  let service: AudiencesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AudiencesService],
    }).compile();

    service = module.get<AudiencesService>(AudiencesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
