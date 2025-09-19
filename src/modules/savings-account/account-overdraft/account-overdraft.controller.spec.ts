import { Test, TestingModule } from '@nestjs/testing';
import { AccountOverdraftController } from './account-overdraft.controller';
import { AccountOverdraftService } from './account-overdraft.service';

describe('AccountOverdraftController', () => {
  let controller: AccountOverdraftController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountOverdraftController],
      providers: [AccountOverdraftService],
    }).compile();

    controller = module.get<AccountOverdraftController>(AccountOverdraftController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
