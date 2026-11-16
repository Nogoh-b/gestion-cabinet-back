import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PayslipPaymentMethod } from '../entities/payslip.entity';

export class PayPayrollPeriodDto {
  @ApiProperty({ enum: PayslipPaymentMethod })
  @IsEnum(PayslipPaymentMethod)
  paymentMethod: PayslipPaymentMethod;

  @ApiProperty({ example: 'VIR-PAIE-MARS-2026' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  paymentReference: string;

  @ApiPropertyOptional({ example: '2026-03-31T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  paymentDate?: string;
}
