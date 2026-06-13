import { PartialType } from '@nestjs/swagger';
import { CreatePayrollPeriodDto } from './create-payroll-period.dto';

export class UpdatePayrollPeriodDto extends PartialType(CreatePayrollPeriodDto) {}
