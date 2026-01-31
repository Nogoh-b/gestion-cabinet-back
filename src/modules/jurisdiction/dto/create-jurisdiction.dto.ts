import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsEmail,
    IsPhoneNumber
} from 'class-validator';
import { Transform } from 'class-transformer';
import { JurisdictionLevel, JurisdictionType } from '../entities/jurisdiction.entity';

export class CreateJurisdictionDto {
  @ApiProperty({ description: 'Code unique de la juridiction' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Nom de la juridiction' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    enum: JurisdictionLevel,
    description: 'Niveau de la juridiction' 
  })
  @IsEnum(JurisdictionLevel)
  level: JurisdictionLevel;

  @ApiProperty({ 
    enum: JurisdictionType,
    description: 'Type de juridiction' 
  })
  @IsEnum(JurisdictionType)
  jurisdiction_type: JurisdictionType;

  @ApiPropertyOptional({ description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Région' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Pays', default: 'France' })
  @IsOptional()
  @IsString()
  country?: string = 'France';

  @ApiPropertyOptional({ description: 'Adresse' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Téléphone' })
  @IsOptional()
  @IsPhoneNumber('FR')
  phone?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Site web' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'ID de la juridiction parente' })
  @IsOptional()
  @Transform(({ value }) => value ? parseInt(value) : undefined)
  parent_id?: number;

  @ApiPropertyOptional({ description: 'Métadonnées JSON' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? JSON.parse(value) : value)
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Actif', default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean = true;
}