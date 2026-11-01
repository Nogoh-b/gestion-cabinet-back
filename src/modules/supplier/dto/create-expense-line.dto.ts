import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseRebillingType } from '../entities/expense-line.entity';

export class CreateExpenseLineDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expense_report_id: number;

  @ApiProperty({ example: '2026-04-08' })
  @IsDateString()
  expense_date: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'transport',
    description: 'Code de catégorie de dépense (liste gérable par le cabinet)',
  })
  @IsString()
  @MaxLength(80)
  category: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount_ht: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax_rate: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount_ttc: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_rebillable?: boolean;

  @ApiPropertyOptional({
    enum: ExpenseRebillingType,
    example: ExpenseRebillingType.EXPENSE,
    description: 'Nature de la refacturation : frais ou débours',
  })
  @IsEnum(ExpenseRebillingType)
  @IsOptional()
  rebilling_type?: ExpenseRebillingType;

  @ApiPropertyOptional({
    example: '0cfce36d-9aec-4ff2-83b8-f20d63866d22',
    description: 'Action du dossier associée à la dépense',
  })
  @IsUUID()
  @IsOptional()
  action_id?: string;

  @ApiPropertyOptional({
    example: 'XAF',
    description: 'Devise de la dépense',
    default: 'XAF',
  })
  @IsString()
  @MaxLength(10)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  dossier_id?: number;
}
