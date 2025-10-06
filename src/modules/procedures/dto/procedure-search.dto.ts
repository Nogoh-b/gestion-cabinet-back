// src/modules/procedures/dto/procedure-search.dto.ts
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class ProcedureSearchDto {
  @ApiPropertyOptional({
    description: 'Recherche textuelle sur le nom ou code',
    example: 'civile'
  })
  @IsOptional()
  @IsString()
  search?: string;



  @ApiPropertyOptional({
    description: 'Filtrer les types principaux uniquement',
    example: true
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  main_types_only?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrer les sous-types uniquement',
    example: false
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  subtypes_only?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrer par statut actif',
    example: true,
    default: true
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  is_active?: boolean = true;

  @ApiPropertyOptional({
    description: 'ID du type parent (pour récupérer les sous-types)',
    example: 2
  })
  @IsOptional()
  @IsString()
  parent_id?: number;
}