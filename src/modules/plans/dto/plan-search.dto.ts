import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PlanSearchDto {
  @ApiPropertyOptional({ description: 'Recherche par nom ou code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par statut actif' })
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Filtrer par IA activée' })
  @IsOptional()
  ai_enabled?: boolean;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'name' })
  @IsOptional()
  @IsString()
  sort_by?: string = 'name';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'ASC' })
  @IsOptional()
  @IsString()
  sort_direction?: 'ASC' | 'DESC' = 'ASC';
}
