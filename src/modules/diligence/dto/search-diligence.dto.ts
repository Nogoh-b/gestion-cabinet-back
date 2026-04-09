// src/modules/diligences/dto/search-diligence.dto.ts
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DiligenceStatus, DiligenceType, DiligencePriority } from '../entities/diligence.entity';

export class DiligenceSearchDto {
  @ApiPropertyOptional({ description: 'Filtrer par titre (recherche texte)' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Filtrer par ID du dossier' })
  @IsOptional()
  @IsInt()
  dossier_id?: number;

  @ApiPropertyOptional({ example: 'b9d6c1dd-664c-4924-b359-fd77337da47e', required: false })
  'sub_stage_id'?: string;

  @ApiPropertyOptional({ description: 'Filtrer par avocat assigné' })
  @IsOptional()
  @IsInt()
  assigned_lawyer_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer par type', enum: DiligenceType })
  @IsOptional()
  @IsEnum(DiligenceType)
  type?: DiligenceType;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: DiligenceStatus })
  @IsOptional()
  @IsEnum(DiligenceStatus)
  status?: DiligenceStatus;

  @ApiPropertyOptional({ description: 'Filtrer par priorité', enum: DiligencePriority })
  @IsOptional()
  @IsEnum(DiligencePriority)
  priority?: DiligencePriority;

  @ApiPropertyOptional({ description: 'Date de début minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date de début maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date_to?: Date;

  @ApiPropertyOptional({ description: 'Date limite minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline_from?: Date;

  @ApiPropertyOptional({ description: 'Date limite maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline_to?: Date;

  @ApiPropertyOptional({ description: 'Recherche texte globale' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer les missions en retard' })
  @IsOptional()
  @IsString()
  overdue?: boolean;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'deadline' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'deadline';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'ASC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'ASC';
}