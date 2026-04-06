// src/modules/procedures/dto/create-procedure-type.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcedureTypeDto {
  @ApiProperty({
    description: 'Nom du type de procédure',
    example: 'Civile',
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Code unique du type de procédure',
    example: 'CIVILE',
    maxLength: 50
  })
  @IsNotEmpty()
  @IsString()
  code: string;

  @ApiPropertyOptional({
    description: 'Description du type de procédure',
    example: 'Procédures civiles générales'
  })
  @IsOptional()
  @IsString()
  description?: string;


  @ApiPropertyOptional({
    description: 'Documents requis pour ce type de procédure',
    example: ['piece_identite', 'justificatif_domicile', 'contrat']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  required_documents?: string[];

  @ApiPropertyOptional({
    description: 'Procedure Template requis pour ce type de procédure',
  })
  @IsOptional()
  @IsString({ each: true })
  procedure_template_id?: string;

  @ApiPropertyOptional({
    description: 'Durée moyenne en jours',
    example: 180
  })
  @IsOptional()
  @IsString()
  average_duration?: number;

  @ApiPropertyOptional({
    description: 'Juridictions spécifiques',
    example: ['Tribunal de Grande Instance', 'Tribunal de Commerce']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specific_jurisdictions?: string[];

  @ApiPropertyOptional({
    description: 'Type actif',
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
    @ApiPropertyOptional({
      description: 'ID du type parent (pour les sous-types)',
      example: 2
    })
    @IsOptional()
    @IsNumber()
    parent_id?: number;
}