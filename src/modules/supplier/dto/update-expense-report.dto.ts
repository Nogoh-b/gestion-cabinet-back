import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateExpenseReportDto } from './create-expense-report.dto';
import { ExpenseReportStatus } from '../entities/expense-report.entity';

export class UpdateExpenseReportDto extends PartialType(
  CreateExpenseReportDto,
) {
  @ApiPropertyOptional({ enum: ExpenseReportStatus })
  @IsOptional()
  @IsEnum(ExpenseReportStatus)
  status?: ExpenseReportStatus;
}
