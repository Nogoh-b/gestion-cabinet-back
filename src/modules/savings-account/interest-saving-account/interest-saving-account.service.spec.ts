import { Test, TestingModule } from '@nestjs/testing';
import { InterestSavingAccountService } from './interest-saving-account.service';

describe('InterestSavingAccountService', () => {
  let service: InterestSavingAccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InterestSavingAccountService],
    }).compile();

    service = module.get<InterestSavingAccountService>(InterestSavingAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
