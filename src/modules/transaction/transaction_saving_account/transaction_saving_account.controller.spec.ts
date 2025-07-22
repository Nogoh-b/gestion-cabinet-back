import { Test, TestingModule } from '@nestjs/testing';
import { TransactionSavingAccountController } from './transaction_saving_account.controller';
import { TransactionSavingAccountService } from './transaction_saving_account.service';

describe('TransactionSavingAccountController', () => {
  let controller: TransactionSavingAccountController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionSavingAccountController],
      providers: [TransactionSavingAccountService],
    }).compile();

    controller = module.get<TransactionSavingAccountController>(TransactionSavingAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
