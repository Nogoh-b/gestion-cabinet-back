import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesSavingsAccountController } from './activities-savings-account.controller';
import { ActivitiesSavingsAccountService } from './activities-savings-account.service';

describe('ActivitiesSavingsAccountController', () => {
  let controller: ActivitiesSavingsAccountController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivitiesSavingsAccountController],
      providers: [ActivitiesSavingsAccountService],
    }).compile();

    controller = module.get<ActivitiesSavingsAccountController>(ActivitiesSavingsAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
