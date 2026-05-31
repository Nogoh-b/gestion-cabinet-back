import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateBlockDto {
  @ApiProperty({ example: 'pdf_header_defaut', description: 'Code unique du bloc' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'En-tête PDF par défaut' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'pdf', enum: ['mail', 'pdf'] })
  @IsIn(['mail', 'pdf'])
  channel: 'mail' | 'pdf';

  @ApiProperty({ example: 'header', enum: ['header', 'footer'] })
  @IsIn(['header', 'footer'])
  kind: 'header' | 'footer';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Gabarit HTML du bloc avec variables {{var}}' })
  @IsString()
  @IsNotEmpty()
  body_html: string;

  @ApiPropertyOptional({ description: 'Liste JSON des variables', example: '["cabinet.name","year"]' })
  @IsString()
  @IsOptional()
  variables?: string;

  @ApiPropertyOptional({ description: 'Bloc par défaut pour son couple (channel, kind)' })
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
