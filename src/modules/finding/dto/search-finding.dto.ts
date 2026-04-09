// src/modules/findings/dto/search-finding.dto.ts
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FindingSeverity, FindingStatus, FindingCategory } from '../entities/finding.entity';

export class FindingSearchDto {
  @ApiPropertyOptional({ description: 'Filtrer par ID de la diligence' })
  @IsOptional()
  @IsInt()
  diligence_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer par sévérité', enum: FindingSeverity })
  @IsOptional()
  @IsEnum(FindingSeverity)
  severity?: FindingSeverity;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: FindingStatus })
  @IsOptional()
  @IsEnum(FindingStatus)
  status?: FindingStatus;

  @ApiPropertyOptional({ description: 'Filtrer par catégorie', enum: FindingCategory })
  @IsOptional()
  @IsEnum(FindingCategory)
  category?: FindingCategory;

  @ApiPropertyOptional({ description: 'Filtrer par avocat créateur' })
  @IsOptional()
  @IsInt()
  created_by_id?: number;

  @ApiPropertyOptional({ description: 'Recherche texte (titre, description)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer les findings critiques uniquement' })
  @IsOptional()
  @IsString()
  critical_only?: boolean;

  @ApiPropertyOptional({ description: 'Date de création minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  created_at_from?: Date;

  @ApiPropertyOptional({ description: 'Date de création maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  created_at_to?: Date;

  @ApiPropertyOptional({ description: 'Date butoir minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  due_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date butoir maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  due_date_to?: Date;

  // Pagination & tri
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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'severity' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'severity';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}