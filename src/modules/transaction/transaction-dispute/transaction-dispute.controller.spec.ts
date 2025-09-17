import { Test, TestingModule } from '@nestjs/testing';
import { TransactionDisputeController } from './transaction-dispute.controller';
import { TransactionDisputeService } from './transaction-dispute.service';

describe('TransactionDisputeController', () => {
  let controller: TransactionDisputeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionDisputeController],
      providers: [TransactionDisputeService],
    }).compile();

    controller = module.get<TransactionDisputeController>(TransactionDisputeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
