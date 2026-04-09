import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchDocumentCategoryDto {
  @ApiPropertyOptional({ example: 'client', description: 'Recherche texte' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'CLIENT', description: 'Code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: true, description: 'Actif' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Système' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_system?: boolean;

  @ApiPropertyOptional({ example: 'public', description: 'Niveau de confidentialité' })
  @IsOptional()
  @IsString()
  confidentiality_level?: string;

  @ApiPropertyOptional({ example: 'name', description: 'Tri par champ' })
  @IsOptional()
  @IsString()
  sort_by?: string = 'sort_order';

  @ApiPropertyOptional({ example: 'ASC', description: 'Direction du tri' })
  @IsOptional()
  @IsString()
  sort_direction?: 'ASC' | 'DESC' = 'ASC';
}