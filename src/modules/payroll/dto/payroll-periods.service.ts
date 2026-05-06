import { PartialType } from '@nestjs/swagger';
import { CreatePayslipLineDto } from './create-payslip-line.dto';

export class UpdatePayslipLineDto extends PartialType(CreatePayslipLineDto) {}