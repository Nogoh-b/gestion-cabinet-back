import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePdfTemplateDto {
  @ApiProperty({ example: 'facture_comptable', description: 'Code unique du modèle' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Facture — Export comptable' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'facture', description: 'Type d\'entité concernée' })
  @IsString()
  @IsNotEmpty()
  entity_type: string;

  @ApiPropertyOptional({ example: 'comptable', description: 'Variante du modèle' })
  @IsString()
  @IsOptional()
  variant?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'FACTURE' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ description: 'Gabarit HTML avec variables {{var}}' })
  @IsString()
  @IsNotEmpty()
  body_html: string;

  @ApiPropertyOptional({ description: 'Liste JSON des variables', example: '["numero","client.full_name"]' })
  @IsString()
  @IsOptional()
  variables?: string;

  @ApiPropertyOptional({ example: 'portrait' })
  @IsIn(['portrait', 'landscape'])
  @IsOptional()
  orientation?: string;

  @ApiPropertyOptional({ example: 'a4' })
  @IsString()
  @IsOptional()
  paper_size?: string;

  @ApiPropertyOptional({ example: 'inter', description: 'Clé de police (FONTS front)' })
  @IsString()
  @IsOptional()
  font_family?: string;

  @ApiPropertyOptional({ description: 'Id du bloc en-tête réutilisable' })
  @IsInt()
  @IsOptional()
  header_block_id?: number;

  @ApiPropertyOptional({ description: 'Id du bloc pied de page réutilisable' })
  @IsInt()
  @IsOptional()
  footer_block_id?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
