import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsNumber
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AudienceTypeCategory } from '../entities/audience-type.entity';

export class CreateAudienceTypeDto {
  @ApiProperty({ description: 'Code unique du type d\'audience' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Nom du type d\'audience' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    enum: AudienceTypeCategory,
    description: 'Catégorie de l\'audience' 
  })
  @IsEnum(AudienceTypeCategory)
  category: AudienceTypeCategory;

  @ApiPropertyOptional({ description: 'Durée par défaut en minutes', default: 60 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value) || 60)
  default_duration_minutes?: number = 60;

  @ApiPropertyOptional({ description: 'Audience publique', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_public?: boolean = true;

  @ApiPropertyOptional({ description: 'Requiert un avocat', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  requires_lawyer?: boolean = false;

  @ApiPropertyOptional({ description: 'Permet le distanciel', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  allows_remote?: boolean = false;

  @ApiPropertyOptional({ description: 'Documents requis (IDs JSON)' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? JSON.parse(value) : value)
  required_documents?: number[];

  @ApiPropertyOptional({ description: 'Délai de préparation en jours' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value) : undefined)
  preparation_time_days?: number;

  @ApiPropertyOptional({ description: 'Actif', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean = true;
}