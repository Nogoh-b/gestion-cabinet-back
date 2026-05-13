import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierCategory } from '../entities/supplier.entity';

export class SupplierSearchDto {
  @ApiPropertyOptional({ description: 'Recherche texte (nom, contact, email)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SupplierCategory, description: 'Filtrer par catégorie' })
  @IsOptional()
  @IsEnum(SupplierCategory)
  category?: SupplierCategory;

  @ApiPropertyOptional({ description: 'Filtrer par statut actif/inactif' })
  @IsOptional()
  status?: boolean;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'company_name' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'company_name';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'ASC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'ASC';
}