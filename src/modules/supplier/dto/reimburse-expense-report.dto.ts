import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../entities/supplier-invoice.entity';

export class ReimburseExpenseReportDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ minLength: 3 })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  paymentReference: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reimbursementDate?: string;
}
