import { Test, TestingModule } from '@nestjs/testing';
import { TypeSavingsAccountController } from './type-savings-account.controller';
import { TypeSavingsAccountService } from './type-savings-account.service';

describe('TypeSavingsAccountController', () => {
  let controller: TypeSavingsAccountController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TypeSavingsAccountController],
      providers: [TypeSavingsAccountService],
    }).compile();

    controller = module.get<TypeSavingsAccountController>(TypeSavingsAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
