import { Test, TestingModule } from '@nestjs/testing';
import { SavingsAccountService } from './savings-account.service';

describe('SavingsAccountService', () => {
  let service: SavingsAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SavingsAccountService],
    }).compile();

    service = module.get<SavingsAccountService>(SavingsAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
