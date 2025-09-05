import { Test, TestingModule } from '@nestjs/testing';
import { TypeCustomerController } from './type-customer.controller';
import { TypeCustomerService } from './type-customer.service';

describe('TypeCustomerController', () => {
  let controller: TypeCustomerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TypeCustomerController],
      providers: [TypeCustomerService],
    }).compile();

    controller = module.get<TypeCustomerController>(TypeCustomerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
