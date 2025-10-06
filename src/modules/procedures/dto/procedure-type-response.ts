// src/modules/procedures/dto/procedure-type-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class ProcedureTypeResponseDto {
  @ApiProperty({
    description: 'ID du type de procédure',
    example: 2
  })
  @Expose()
  id: number;

  @ApiProperty({
    description: 'Nom du type de procédure',
    example: 'Civile'
  })
  @Expose()
  name: string;

  @ApiProperty({
    description: 'Code unique',
    example: 'CIVILE'
  })
  @Expose()
  code: string;

  @ApiPropertyOptional({
    description: 'Description'
  })
  @Expose()
  description?: string;



  @ApiProperty({
    description: 'Est un sous-type',
    example: false
  })
  @Expose()
  is_subtype: boolean;

  @ApiPropertyOptional({
    description: 'Niveau de hiérarchie',
    example: 1
  })
  @Expose()
  hierarchy_level?: number;

  @ApiPropertyOptional({
    description: 'Documents requis'
  })
  @Expose()
  required_documents?: string[];

  @ApiPropertyOptional({
    description: 'Durée moyenne en jours',
    example: 180
  })
  @Expose()
  average_duration?: number;

  @ApiPropertyOptional({
    description: 'Juridictions spécifiques'
  })
  @Expose()
  specific_jurisdictions?: string[];

  @ApiProperty({
    description: 'Type actif',
    example: true
  })
  @Expose()
  is_active: boolean;

  @ApiPropertyOptional({
    description: 'Type parent (pour les sous-types)'
  })
  @Expose()
  @Transform(({ obj }) => obj.parent ? {
    id: obj.parent.id,
    name: obj.parent.name,
    code: obj.parent.code
  } : null)
  parent?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiPropertyOptional({
    description: 'Sous-types (pour les types principaux)'
  })
  @Expose()
  @Transform(({ obj }) => obj.subtypes ? obj.subtypes.map(subtype => ({
    id: subtype.id,
    name: subtype.name,
    code: subtype.code,
    is_active: subtype.is_active
  })) : [])
  subtypes?: any[];

  @ApiProperty({
    description: 'Chemin complet',
    example: 'Civile > Divorce'
  })
  @Expose()
  full_path: string;

  @ApiProperty({
    description: 'Est un type principal',
    example: true
  })
  @Expose()
  is_main_type: boolean;

  @ApiProperty({
    description: 'Nombre de dossiers utilisant ce type',
    example: 15
  })
  @Expose()
  dossier_count: number;
}