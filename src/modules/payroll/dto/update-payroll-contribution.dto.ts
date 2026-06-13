import { PartialType } from '@nestjs/swagger';
import { CreatePayrollContributionDto } from './create-payroll-contribution.dto';

export class UpdatePayrollContributionDto extends PartialType(CreatePayrollContributionDto) {}
