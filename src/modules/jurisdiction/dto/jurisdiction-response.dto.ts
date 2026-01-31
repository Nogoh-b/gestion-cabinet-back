import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { JurisdictionLevel, JurisdictionType } from '../entities/jurisdiction.entity';


export class JurisdictionResponseDto {
  @ApiProperty()
  @Expose()
  id: number;

  @ApiProperty()
  @Expose()
  code: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional()
  @Expose()
  description: string;

  @ApiProperty({ enum: JurisdictionLevel })
  @Expose()
  level: JurisdictionLevel;

  @ApiProperty({ enum: JurisdictionType })
  @Expose()
  jurisdiction_type: JurisdictionType;

  @ApiPropertyOptional()
  @Expose()
  city: string;

  @ApiPropertyOptional()
  @Expose()
  region: string;

  @ApiPropertyOptional()
  @Expose()
  country: string;

  @ApiPropertyOptional()
  @Expose()
  address: string;

  @ApiPropertyOptional()
  @Expose()
  phone: string;

  @ApiPropertyOptional()
  @Expose()
  email: string;

  @ApiPropertyOptional()
  @Expose()
  website: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.parent_jurisdiction?.id)
  parent_id?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.parent_jurisdiction ? {
    id: obj.parent_jurisdiction.id,
    code: obj.parent_jurisdiction.code,
    name: obj.parent_jurisdiction.name
  } : undefined)
  parent_jurisdiction?: {
    id: number;
    code: string;
    name: string;
  };

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.court_number)
  court_number?: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.judge_name)
  judge_name?: string;

  @ApiProperty()
  @Expose()
  is_active: boolean;

  @ApiProperty()
  @Expose()
  created_at: Date;

  @ApiProperty()
  @Expose()
  updated_at: Date;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const typeLabels = {
      [JurisdictionType.CIVIL]: 'Civil',
      [JurisdictionType.COMMERCIAL]: 'Commercial',
      [JurisdictionType.ADMINISTRATIVE]: 'Administratif',
      [JurisdictionType.PENAL]: 'Pénal',
      [JurisdictionType.LABOR]: 'Travail',
      [JurisdictionType.FAMILY]: 'Famille'
    };
    return typeLabels[obj.jurisdiction_type] || 'Inconnu';
  })
  jurisdiction_type_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const levelLabels = {
      [JurisdictionLevel.MUNICIPAL]: 'Municipal',
      [JurisdictionLevel.REGIONAL]: 'Régional',
      [JurisdictionLevel.NATIONAL]: 'National',
      [JurisdictionLevel.INTERNATIONAL]: 'International'
    };
    return levelLabels[obj.level] || 'Inconnu';
  })
  level_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => `${obj.city || ''} ${obj.region || ''}`.trim())
  location: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.audiences?.length || 0)
  audience_count: number;
}