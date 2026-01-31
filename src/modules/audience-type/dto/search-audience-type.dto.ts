import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { AudienceTypeCategory } from '../entities/audience-type.entity';

export class SearchAudienceTypeDto {
  @ApiPropertyOptional({ example: 'préliminaire', description: 'Recherche texte' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AudienceTypeCategory, description: 'Catégorie' })
  @IsOptional()
  @IsEnum(AudienceTypeCategory)
  category?: AudienceTypeCategory;

  @ApiPropertyOptional({ example: 'PRE', description: 'Code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: true, description: 'Publique' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_public?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Requiert avocat' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  requires_lawyer?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Permet distanciel' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  allows_remote?: boolean;

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