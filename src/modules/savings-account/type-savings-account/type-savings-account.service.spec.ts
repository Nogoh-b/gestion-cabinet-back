import { Test, TestingModule } from '@nestjs/testing';
import { TypeSavingsAccountService } from './type-savings-account.service';

describe('TypeSavingsAccountService', () => {
  let service: TypeSavingsAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypeSavingsAccountService],
    }).compile();

    service = module.get<TypeSavingsAccountService>(TypeSavingsAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
