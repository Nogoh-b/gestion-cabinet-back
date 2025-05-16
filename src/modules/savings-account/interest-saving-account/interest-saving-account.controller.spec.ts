import { Test, TestingModule } from '@nestjs/testing';
import { InterestSavingAccountController } from './interest-saving-account.controller';
import { InterestSavingAccountService } from './interest-saving-account.service';

describe('InterestSavingAccountController', () => {
  let controller: InterestSavingAccountController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InterestSavingAccountController],
      providers: [InterestSavingAccountService],
    }).compile();

    controller = module.get<InterestSavingAccountController>(InterestSavingAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
