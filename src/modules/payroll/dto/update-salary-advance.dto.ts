import { PartialType } from '@nestjs/swagger';
import { CreateSalaryAdvanceDto } from './create-salary-advance.dto';

export class UpdateSalaryAdvanceDto extends PartialType(
  CreateSalaryAdvanceDto,
) {}
