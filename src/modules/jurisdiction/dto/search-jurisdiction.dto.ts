import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';
import { JurisdictionLevel, JurisdictionType } from '../entities/jurisdiction.entity';

export class SearchJurisdictionDto {
  @ApiPropertyOptional({ example: 'paris', description: 'Recherche texte' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: JurisdictionLevel, description: 'Niveau' })
  @IsOptional()
  @IsEnum(JurisdictionLevel)
  level?: JurisdictionLevel;

  @ApiPropertyOptional({ enum: JurisdictionType, description: 'Type' })
  @IsOptional()
  @IsEnum(JurisdictionType)
  jurisdiction_type?: JurisdictionType;

  @ApiPropertyOptional({ example: 'Paris', description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Île-de-France', description: 'Région' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'France', description: 'Pays' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: true, description: 'Actif' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'ID parent' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  parent_id?: number;

  @ApiPropertyOptional({ example: 'name', description: 'Tri par champ' })
  @IsOptional()
  @IsString()
  sort_by?: string = 'name';

  @ApiPropertyOptional({ example: 'ASC', description: 'Direction du tri' })
  @IsOptional()
  @IsString()
  sort_direction?: 'ASC' | 'DESC' = 'ASC';
}