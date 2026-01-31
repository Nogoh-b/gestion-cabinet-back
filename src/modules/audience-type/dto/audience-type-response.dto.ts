import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



import { AudienceTypeCategory } from '../entities/audience-type.entity';




export class AudienceTypeResponseDto {
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

  @ApiProperty({ enum: AudienceTypeCategory })
  @Expose()
  category: AudienceTypeCategory;

  @ApiProperty()
  @Expose()
  default_duration_minutes: number;

  @ApiProperty()
  @Expose()
  is_public: boolean;

  @ApiProperty()
  @Expose()
  requires_lawyer: boolean;

  @ApiProperty()
  @Expose()
  allows_remote: boolean;

  @ApiProperty()
  @Expose()
  is_active: boolean;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.preparation_time_days)
  preparation_time_days?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.legal_basis)
  legal_basis?: string;

  @ApiProperty()
  @Expose()
  created_at: Date;

  @ApiProperty()
  @Expose()
  updated_at: Date;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.audiences?.length || 0)
  audience_count: number;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const hours = Math.floor(obj.default_duration_minutes / 60);
    const minutes = obj.default_duration_minutes % 60;
    
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}min`);
    
    return parts.join(' ') || '0min';
  })
  duration_formatted: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const categoryLabels = {
      [AudienceTypeCategory.PRELIMINARY]: 'Préliminaire',
      [AudienceTypeCategory.HEARING]: 'Audience',
      [AudienceTypeCategory.JUDGMENT]: 'Jugement',
      [AudienceTypeCategory.CONCILIATION]: 'Conciliation',
      [AudienceTypeCategory.EXPERTISE]: 'Expertise',
      [AudienceTypeCategory.APPEAL]: 'Appel',
      [AudienceTypeCategory.CASATION]: 'Cassation'
    };
    return categoryLabels[obj.category] || 'Inconnu';
  })
  category_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const colors = {
      [AudienceTypeCategory.PRELIMINARY]: 'blue',
      [AudienceTypeCategory.HEARING]: 'green',
      [AudienceTypeCategory.JUDGMENT]: 'red',
      [AudienceTypeCategory.CONCILIATION]: 'yellow',
      [AudienceTypeCategory.EXPERTISE]: 'purple',
      [AudienceTypeCategory.APPEAL]: 'orange',
      [AudienceTypeCategory.CASATION]: 'pink'
    };
    return colors[obj.category] || 'gray';
  })
  category_color: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.requires_lawyer ? 'Obligatoire' : 'Facultatif')
  lawyer_requirement_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.allows_remote ? 'Distanciel autorisé' : 'Présentiel uniquement')
  remote_status_label: string;
}