import { PartialType } from '@nestjs/swagger';
import { CreateExpenseReportDto } from './create-expense-report.dto';

export class UpdateExpenseReportDto extends PartialType(
  CreateExpenseReportDto,
) {}
