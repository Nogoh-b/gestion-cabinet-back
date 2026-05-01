import { Module } from '@nestjs/common';
import { PayrollService } from './payslips.service';
import { PayrollController } from './payroll-periods.controller';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
