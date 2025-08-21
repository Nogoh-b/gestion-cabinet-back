import { Test, TestingModule } from '@nestjs/testing';
import { TransactionTypeController } from './transaction_type.controller';
import { TransactionTypeService } from './transaction_type.service';

describe('TransactionTypeController', () => {
  let controller: TransactionTypeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionTypeController],
      providers: [TransactionTypeService],
    }).compile();

    controller = module.get<TransactionTypeController>(TransactionTypeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
