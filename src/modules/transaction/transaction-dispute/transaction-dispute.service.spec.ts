import { Test, TestingModule } from '@nestjs/testing';
import { TransactionDisputeService } from './transaction-dispute.service';

describe('TransactionDisputeService', () => {
  let service: TransactionDisputeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionDisputeService],
    }).compile();

    service = module.get<TransactionDisputeService>(TransactionDisputeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
