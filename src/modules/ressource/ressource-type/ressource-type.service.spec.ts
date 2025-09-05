import { Test, TestingModule } from '@nestjs/testing';
import { RessourceTypeService } from './ressource-type.service';

describe('RessourceTypeService', () => {
  let service: RessourceTypeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RessourceTypeService],
    }).compile();

    service = module.get<RessourceTypeService>(RessourceTypeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
