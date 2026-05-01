import { Test, TestingModule } from '@nestjs/testing';
import { PayrollController } from './payroll-periods.controller';
import { PayrollService } from './payslips.service';

describe('PayrollController', () => {
  let controller: PayrollController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollController],
      providers: [PayrollService],
    }).compile();

    controller = module.get<PayrollController>(PayrollController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
