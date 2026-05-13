import { PartialType } from '@nestjs/swagger';
import { CreateExpenseLineDto } from './create-expense-line.dto';

export class UpdateExpenseLineDto extends PartialType(CreateExpenseLineDto) {}