import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierInvoiceStatus } from '../entities/supplier-invoice.entity';

export class SupplierInvoiceSearchDto {
  @ApiPropertyOptional({ description: 'Recherche texte (numéro, description)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par fournisseur' })
  @IsOptional()
  @IsInt()
  supplier_id?: number;

  @ApiPropertyOptional({ enum: SupplierInvoiceStatus })
  @IsOptional()
  @IsEnum(SupplierInvoiceStatus)
  status?: SupplierInvoiceStatus;

  @ApiPropertyOptional({ description: 'Date échéance minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  due_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date échéance maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  due_date_to?: Date;

  @ApiPropertyOptional({ description: 'Factures en retard uniquement' })
  @IsOptional()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Page', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Taille de page', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'due_date' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'due_date';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'ASC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'ASC';
}