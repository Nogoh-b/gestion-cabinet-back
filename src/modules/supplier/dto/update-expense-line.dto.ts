import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExpenseLineDto } from './create-expense-line.dto';

export class UpdateExpenseLineDto extends PartialType(
  OmitType(CreateExpenseLineDto, ['expense_report_id'] as const),
) {}
