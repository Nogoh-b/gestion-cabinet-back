// src/modules/findings/dto/response-finding.dto.ts
import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { FindingSeverity, FindingStatus, FindingCategory } from '../entities/finding.entity';

export class FindingResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Clause de non-concurrence trop large' })
  @Expose()
  title: string;

  @ApiProperty({ example: 'Description détaillée...' })
  @Expose()
  description: string;

  @ApiProperty({ enum: FindingSeverity })
  @Expose()
  severity: FindingSeverity;

  @ApiProperty({ enum: FindingStatus })
  @Expose()
  status: FindingStatus;

  @ApiProperty({ enum: FindingCategory })
  @Expose()
  category: FindingCategory;

  @ApiProperty({ example: 'Cette clause pourrait empêcher l\'acquisition...' })
  @Expose()
  impact?: string;

  @ApiProperty({ example: 'Négocier une réduction à 2 ans...' })
  @Expose()
  recommendation?: string;

  @ApiProperty({ example: 'Article L. 1234-5 du Code du travail...' })
  @Expose()
  legal_basis?: string;

  @ApiProperty({ example: 150000 })
  @Expose()
  estimated_risk_amount?: number;

  @ApiProperty({ example: '2026-04-01' })
  @Expose()
  due_date?: Date;

  @ApiProperty({ example: '2026-03-15T10:30:00Z' })
  @Expose()
  validated_at?: Date;

  @ApiProperty({ example: '2026-03-20T14:00:00Z' })
  @Expose()
  resolved_at?: Date;

  @ApiProperty({ example: 'Commentaire du client...' })
  @Expose()
  client_comment?: string;

  @ApiProperty({ example: true })
  @Expose()
  confidential: boolean;

  // Relations
  @ApiProperty({ example: 5 })
  @Expose()
  diligence_id: number;

  @ApiProperty({ example: 12 })
  @Expose()
  document_id?: number;

  @ApiProperty({ example: 42 })
  @Expose()
  created_by_id?: number;

  @ApiProperty({ example: 38 })
  @Expose()
  validated_by_id?: number;

  @ApiProperty({
    example: {
      id: 5,
      title: 'Due Diligence acquisition Société ABC'
    }
  })
  @Expose()
  @Transform(({ obj }) => obj.diligence ? {
    id: obj.diligence.id,
    title: obj.diligence.title
  } : null)
  diligence?: {
    id: number;
    title: string;
  };

  @ApiProperty({
    example: {
      id: 12,
      name: 'Contrat de travail - Jean Martin.pdf'
    }
  })
  @Expose()
  @Transform(({ obj }) => obj.document ? {
    id: obj.document.id,
    name: obj.document.name
  } : null)
  document?: {
    id: number;
    name: string;
  };

  @ApiProperty({
    example: {
      id: 42,
      full_name: 'Maître Sophie Martin'
    }
  })
  @Expose()
  @Transform(({ obj }) => obj.created_by ? {
    id: obj.created_by.id,
    full_name: obj.created_by.full_name
  } : null)
  created_by?: {
    id: number;
    full_name: string;
  };

  // Computed fields
  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => obj.severity === 'critical')
  is_critical: boolean;

  @ApiProperty({ example: 15 })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.due_date) return null;
    const today = new Date();
    const dueDate = new Date(obj.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  })
  days_to_resolve: number | null;

  @ApiProperty({ example: 'Critique' })
  @Expose()
  @Transform(({ obj }) => {
    const severityLabels = {
      [FindingSeverity.CRITICAL]: 'Critique',
      [FindingSeverity.HIGH]: 'Élevé',
      [FindingSeverity.MEDIUM]: 'Moyen',
      [FindingSeverity.LOW]: 'Faible',
      [FindingSeverity.INFO]: 'Information',
    };
    return severityLabels[obj.severity] || 'Inconnu';
  })
  severity_label: string;

  @ApiProperty({ example: 'Identifié' })
  @Expose()
  @Transform(({ obj }) => {
    const statusLabels = {
      [FindingStatus.IDENTIFIED]: 'Identifié',
      [FindingStatus.IN_ANALYSIS]: 'En analyse',
      [FindingStatus.VALIDATED]: 'Validé',
      [FindingStatus.RESOLVED]: 'Résolu',
      [FindingStatus.WAIVED]: 'Accepté',
    };
    return statusLabels[obj.status] || 'Inconnu';
  })
  status_label: string;
}

// DTO pour les listes
export class FindingListResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Clause de non-concurrence trop large' })
  @Expose()
  title: string;

  @ApiProperty({ enum: FindingSeverity })
  @Expose()
  severity: FindingSeverity;

  @ApiProperty({ enum: FindingStatus })
  @Expose()
  status: FindingStatus;

  @ApiProperty({ enum: FindingCategory })
  @Expose()
  category: FindingCategory;

  @ApiProperty({ example: 5 })
  @Expose()
  diligence_id: number;

  @ApiProperty({ example: 'Due Diligence acquisition Société ABC' })
  @Expose()
  @Transform(({ obj }) => obj.diligence?.title)
  diligence_title: string;

  @ApiProperty({ example: 'Maître Sophie Martin' })
  @Expose()
  @Transform(({ obj }) => obj.created_by?.full_name)
  created_by_name: string;

  @ApiProperty({ example: '2026-04-01' })
  @Expose()
  due_date?: Date;

  @ApiProperty({ example: 150000 })
  @Expose()
  estimated_risk_amount?: number;

  @ApiProperty({ example: true })
  @Expose()
  @Transform(({ obj }) => obj.severity === 'critical')
  is_critical: boolean;

  @ApiProperty({ example: 15 })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.due_date) return null;
    const today = new Date();
    const dueDate = new Date(obj.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  })
  days_to_resolve: number | null;
}