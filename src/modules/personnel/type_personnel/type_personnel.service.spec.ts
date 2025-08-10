import { Test, TestingModule } from '@nestjs/testing';
import { TypePersonnelService } from './type_personnel.service';

describe('TypePersonnelService', () => {
  let service: TypePersonnelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypePersonnelService],
    }).compile();

    service = module.get<TypePersonnelService>(TypePersonnelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
