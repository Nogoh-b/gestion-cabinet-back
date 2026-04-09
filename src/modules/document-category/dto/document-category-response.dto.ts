import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



export class DocumentCategoryResponseDto {
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

  @ApiPropertyOptional()
  @Expose()
  icon: string;

  @ApiPropertyOptional()
  @Expose()
  color: string;

  @ApiProperty()
  @Expose()
  sort_order: number;

  @ApiProperty()
  @Expose()
  is_active: boolean;

  @ApiProperty()
  @Expose()
  is_system: boolean;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.retention_period)
  retention_period?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.max_file_size_mb)
  max_file_size_mb?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.confidentiality_level)
  confidentiality_level?: string;

  @ApiProperty()
  @Expose()
  created_at: Date;

  @ApiProperty()
  @Expose()
  updated_at: Date;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.document_types?.length || 0)
  document_type_count: number;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const colorMap = {
      'public': 'success',
      'internal': 'warning',
      'confidential': 'danger'
    };
    return colorMap[obj.metadata?.confidentiality_level] || 'secondary';
  })
  confidentiality_color: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.metadata?.retention_period) return 'Illimité';
    const years = Math.floor(obj.metadata.retention_period / 365);
    const months = Math.floor((obj.metadata.retention_period % 365) / 30);
    
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} an${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} mois`);
    
    return parts.join(' ') || `${obj.metadata.retention_period} jours`;
  })
  retention_period_formatted: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const iconMap = {
      'fa-file-pdf': 'PDF',
      'fa-file-image': 'Image',
      'fa-file-word': 'Word',
      'fa-file-excel': 'Excel',
      'fa-file-alt': 'Document',
      'fa-file': 'Fichier'
    };
    return iconMap[obj.icon] || 'Document';
  })
  icon_label: string;
}