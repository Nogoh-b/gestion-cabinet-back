import { Transform } from 'class-transformer';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsNumber
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { InvoiceTypeCategory, TaxRate } from '../entities/invoice-type.entity';


export class CreateInvoiceTypeDto {
  @ApiProperty({ description: 'Code unique du type de facture' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Nom du type de facture' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    enum: InvoiceTypeCategory,
    description: 'Catégorie de la facture' 
  })
  @IsEnum(InvoiceTypeCategory)
  category: InvoiceTypeCategory;

  @ApiProperty({ 
    enum: TaxRate,
    description: 'Taux de TVA par défaut' 
  })
  @IsEnum(TaxRate)
  default_tax_rate: TaxRate;

  @ApiPropertyOptional({ description: 'Facturable', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_billable?: boolean = true;

  @ApiPropertyOptional({ description: 'Requiert approbation', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  requires_approval?: boolean = true;

  @ApiPropertyOptional({ description: 'Délai de paiement par défaut', default: 30 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value) || 30)
  default_payment_days?: number = 30;

  @ApiPropertyOptional({ description: 'Code comptable' })
  @IsOptional()
  @IsString()
  accounting_code?: string;

  @ApiPropertyOptional({ description: 'Unité par défaut' })
  @IsOptional()
  @IsString()
  default_unit?: 'hour' | 'day' | 'unit' | 'fixed';

  @ApiPropertyOptional({ description: 'Prix par défaut' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  default_price?: number;

  @ApiPropertyOptional({ description: 'Exonéré de TVA', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  vat_exempt?: boolean = false;

  @ApiPropertyOptional({ description: 'Actif', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean = true;
}