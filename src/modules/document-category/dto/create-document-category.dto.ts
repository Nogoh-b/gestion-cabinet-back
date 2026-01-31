import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsHexColor } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateDocumentCategoryDto {
  @ApiProperty({ description: 'Code unique de la catégorie' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Nom de la catégorie' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Icône (classe FontAwesome)' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Couleur hexadécimale', default: '#4F46E5' })
  @IsOptional()
  @IsHexColor()
  color?: string = '#4F46E5';

  @ApiPropertyOptional({ description: 'Ordre de tri', default: 0 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value) || 0)
  sort_order?: number = 0;

  @ApiPropertyOptional({ description: 'Période de rétention en jours' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value) : undefined)
  retention_period?: number;

  @ApiPropertyOptional({ description: 'Types MIME autorisés (JSON array)' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? JSON.parse(value) : value)
  allowed_mime_types?: string[];

  @ApiPropertyOptional({ description: 'Taille max du fichier en MB', default: 50 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value) : 50)
  max_file_size_mb?: number = 50;

  @ApiPropertyOptional({ description: 'Niveau de confidentialité' })
  @IsOptional()
  @IsString()
  confidentiality_level?: 'public' | 'internal' | 'confidential';

  @ApiPropertyOptional({ description: 'Actif', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean = true;
}