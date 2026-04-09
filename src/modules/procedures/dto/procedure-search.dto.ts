// src/modules/procedures/dto/procedure-search.dto.ts
import { IsOptional, IsString, IsNumber, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

export class ProcedureSearchDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Recherche textuelle sur le nom, code ou description',
    example: 'civile'
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par code exact',
    example: 'CIVILE'
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par nom exact',
    example: 'Civile'
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut sous-type',
    example: false
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true) return 1;
    if (value === 'false' || value === '0' || value === false) return 0;
    return value;
  })
  @IsNumber()
  @IsIn([0, 1], { message: 'is_active doit être 0 ou 1' })
  is_subtype?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par ID du parent',
    example: 2
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  parent_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par niveau hiérarchique',
    example: 1
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  hierarchy_level?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par statut actif',
    example: true
  })
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true) return 1;
    if (value === 'false' || value === '0' || value === false) return 0;
    return value;
  })
  @IsNumber()
  @IsIn([0, 1], { message: 'is_active doit être 0 ou 1' })
  is_active?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par durée moyenne minimale (en jours)',
    example: 30
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  min_duration?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par durée moyenne maximale (en jours)',
    example: 365
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  max_duration?: number;

  @ApiPropertyOptional({
    description: 'Filtrer par document requis spécifique',
    example: 'Acte de naissance'
  })
  @IsOptional()
  @IsString()
  required_document?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par juridiction spécifique',
    example: 'Paris'
  })
  @IsOptional()
  @IsString()
  jurisdiction?: string;

  // Pagination
  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    default: 1
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
    default: 10
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'name',
    enum: ['id', 'name', 'code', 'hierarchy_level', 'created_at', 'updated_at']
  })
  @IsOptional()
  @IsString()
  sort_by?: string = 'name';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'ASC',
    enum: ['ASC', 'DESC']
  })
  @IsOptional()
  @IsString()
  sort_order?: 'ASC' | 'DESC' = 'ASC';
}