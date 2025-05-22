import { Test, TestingModule } from '@nestjs/testing';
import { TransactionSavingAccountService } from './transaction_saving_account.service';

describe('TransactionSavingAccountService', () => {
  let service: TransactionSavingAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionSavingAccountService],
    }).compile();

    service = module.get<TransactionSavingAccountService>(TransactionSavingAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
