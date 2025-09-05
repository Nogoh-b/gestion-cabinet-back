import { Test, TestingModule } from '@nestjs/testing';
import { TypeCustomerService } from './type-customer.service';

describe('TypeCustomerService', () => {
  let service: TypeCustomerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypeCustomerService],
    }).compile();

    service = module.get<TypeCustomerService>(TypeCustomerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
