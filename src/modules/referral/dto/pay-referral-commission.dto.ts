import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CommissionPaymentMethod } from '../entities/referral-commission.entity';

export class PayReferralCommissionDto {
  @ApiProperty({ enum: CommissionPaymentMethod })
  @IsEnum(CommissionPaymentMethod)
  paymentMethod: CommissionPaymentMethod;

  @ApiProperty({ example: 'VIR-COM-2026-001' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  paymentReference: string;

  @ApiPropertyOptional({ example: '2026-07-28T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  paymentDate?: string;
}
