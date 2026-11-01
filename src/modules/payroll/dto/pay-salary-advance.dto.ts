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

export class PaySalaryAdvanceDto {
  @ApiProperty({ enum: PayslipPaymentMethod })
  @IsEnum(PayslipPaymentMethod)
  paymentMethod: PayslipPaymentMethod;

  @ApiProperty({ example: 'VIR-AVANCE-2026-001' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  paymentReference: string;

  @ApiPropertyOptional({ example: '2026-07-28T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  paymentDate?: string;
}
