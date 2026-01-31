import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { InvoiceTypeCategory, TaxRate } from '../entities/invoice-type.entity';

export class SearchInvoiceTypeDto {
  @ApiPropertyOptional({ example: 'honoraires', description: 'Recherche texte' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InvoiceTypeCategory, description: 'Catégorie' })
  @IsOptional()
  @IsEnum(InvoiceTypeCategory)
  category?: InvoiceTypeCategory;

  @ApiPropertyOptional({ enum: TaxRate, description: 'Taux TVA' })
  @IsOptional()
  @IsEnum(TaxRate)
  default_tax_rate?: TaxRate;

  @ApiPropertyOptional({ example: 'HON', description: 'Code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: true, description: 'Facturable' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_billable?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Requiert approbation' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  requires_approval?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Exonéré TVA' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  vat_exempt?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Actif' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean;

  @ApiPropertyOptional({ example: 'name', description: 'Tri par champ' })
  @IsOptional()
  @IsString()
  sort_by?: string = 'category';

  @ApiPropertyOptional({ example: 'ASC', description: 'Direction du tri' })
  @IsOptional()
  @IsString()
  sort_direction?: 'ASC' | 'DESC' = 'ASC';
}