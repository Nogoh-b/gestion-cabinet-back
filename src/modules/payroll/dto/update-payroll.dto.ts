import { PartialType } from '@nestjs/swagger';
import { CreatePayrollDto } from './create-payroll-period.dto';

export class UpdatePayrollDto extends PartialType(CreatePayrollDto) {}
