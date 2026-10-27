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
  MinLength,
} from 'class-validator';
import { ExpenseRebillingType } from '../entities/expense-line.entity';

export class CreateSupplierInvoiceDto {
  @ApiProperty({ description: 'Identifiant du fournisseur' })
  @IsInt()
  @Min(1)
  supplier_id: number;

  @ApiPropertyOptional({
    description: 'Dossier client associé lorsque la dépense est refacturable',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  dossier_id?: number;

  @ApiPropertyOptional({
    description: 'Action du dossier à l’origine de la dépense',
  })
  @IsOptional()
  @IsUUID()
  action_id?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_rebillable?: boolean;

  @ApiPropertyOptional({
    enum: ExpenseRebillingType,
    default: ExpenseRebillingType.EXPENSE,
  })
  @IsOptional()
  @IsEnum(ExpenseRebillingType)
  rebilling_type?: ExpenseRebillingType;

  @ApiPropertyOptional({ example: 'XAF', default: 'XAF' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({
    description:
      'Numéro émis par le fournisseur ; une référence interne est générée si absent',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoice_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ example: '2026-03-15' })
  @IsDateString()
  invoice_date: string;

  @ApiProperty({ example: '2026-04-15' })
  @IsDateString()
  due_date: string;

  @ApiProperty({ example: 150 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount_ht: number;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax_rate: number;

  @ApiProperty({ example: 30 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount_tva: number;

  @ApiProperty({ example: 180 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount_ttc: number;

  @ApiPropertyOptional({ description: 'Identifiant de l’agence' })
  @IsOptional()
  @IsInt()
  @Min(1)
  branch_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  notes?: string;
}
