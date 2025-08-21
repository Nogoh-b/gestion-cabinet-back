import { Test, TestingModule } from '@nestjs/testing';
import { SavingsAccountController } from './savings-account.controller';
import { SavingsAccountService } from './savings-account.service';

describe('SavingsAccountController', () => {
  let controller: SavingsAccountController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavingsAccountController],
      providers: [SavingsAccountService],
    }).compile();

    controller = module.get<SavingsAccountController>(SavingsAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
