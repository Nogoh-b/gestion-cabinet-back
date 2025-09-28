import { Test, TestingModule } from '@nestjs/testing';
import { AccountOverdraftService } from './account-overdraft.service';

describe('AccountOverdraftService', () => {
  let service: AccountOverdraftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountOverdraftService],
    }).compile();

    service = module.get<AccountOverdraftService>(AccountOverdraftService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
