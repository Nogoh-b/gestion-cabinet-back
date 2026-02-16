// src/modules/diligences/dto/response-diligence.dto.ts
import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { DiligenceStatus, DiligenceType, DiligencePriority } from '../entities/diligence.entity';

export class DiligenceResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Due Diligence acquisition Société ABC' })
  @Expose()
  title: string;

  @ApiProperty({ example: 'Audit complet...' })
  @Expose()
  description: string;

  @ApiProperty({ enum: DiligenceType })
  @Expose()
  type: DiligenceType;

  @ApiProperty({ enum: DiligenceStatus })
  @Expose()
  status: DiligenceStatus;

  @ApiProperty({ enum: DiligencePriority })
  @Expose()
  priority: DiligencePriority;

  @ApiProperty({ example: '2026-03-01' })
  @Expose()
  start_date: Date;

  @ApiProperty({ example: '2026-04-15' })
  @Expose()
  deadline: Date;

  @ApiProperty({ example: '2026-04-10', required: false })
  @Expose()
  completion_date?: Date;

  @ApiProperty({ example: 45 })
  @Expose()
  budget_hours?: number;

  @ApiProperty({ example: 12 })
  @Expose()
  actual_hours?: number;

  @ApiProperty({ example: 'Périmètre défini...' })
  @Expose()
  scope?: string;

  @ApiProperty({ example: 'Résumé des findings...' })
  @Expose()
  findings_summary?: string;

  @ApiProperty({ example: 'Recommandations finales...' })
  @Expose()
  recommendations?: string;

  @ApiProperty({ example: false })
  @Expose()
  report_generated: boolean;

  @ApiProperty({ example: 'https://storage.example.com/report.pdf', required: false })
  @Expose()
  report_url?: string;

  // Relations
  @ApiProperty({ example: 15 })
  @Expose()
  dossier_id: number;

  @ApiProperty({ example: 42 })
  @Expose()
  assigned_lawyer_id?: number;

  @ApiProperty({
    example: {
      id: 15,
      dossier_number: 'DOS-2026-015',
      object: 'Acquisition société ABC',
      client: {
        id: 8,
        full_name: 'Jean Dupont',
        company_name: 'ABC Corp'
      }
    }
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.dossier?.id,
    dossier_number: obj.dossier?.dossier_number,
    object: obj.dossier?.object,
    client: obj.dossier?.client ? {
      id: obj.dossier.client.id,
      full_name: obj.dossier.client.full_name,
      company_name: obj.dossier.client.company_name
    } : null
  }))
  dossier?: {
    id: number;
    dossier_number: string;
    object: string;
    client: {
      id: number;
      full_name?: string;
      company_name?: string;
    };
  };

  @ApiProperty({
    example: {
      id: 42,
      full_name: 'Maître Sophie Martin',
      email: 's.martin@cabinet.fr'
    }
  })
  @Expose()
  @Transform(({ obj }) => obj.assigned_lawyer ? {
    id: obj.assigned_lawyer.id,
    full_name: obj.assigned_lawyer.full_name,
    email: obj.assigned_lawyer.email
  } : null)
  assigned_lawyer?: {
    id: number;
    full_name: string;
    email: string;
  };

  // Computed fields
  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => {
    if (obj.status === DiligenceStatus.COMPLETED || obj.status === DiligenceStatus.CANCELLED) {
      return false;
    }
    const today = new Date();
    return new Date(obj.deadline) < today;
  })
  is_overdue: boolean;

  @ApiProperty({ example: 15 })
  @Expose()
  @Transform(({ obj }) => {
    if (obj.status === DiligenceStatus.COMPLETED || obj.status === DiligenceStatus.CANCELLED) {
      return null;
    }
    const today = new Date();
    const deadline = new Date(obj.deadline);
    const diffTime = deadline.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  })
  days_remaining: number | null;

  @ApiProperty({ example: 65 })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.findings || obj.findings.length === 0) return 0;
    const totalFindings = obj.findings.length;
    const reviewedFindings = obj.findings.filter(f => f.status !== 'identified').length;
    return Math.round((reviewedFindings / totalFindings) * 100);
  })
  progress_percentage: number;

  @ApiProperty({ example: 3 })
  @Expose()
  @Transform(({ obj }) => obj.findings?.filter(f => f.severity === 'critical').length || 0)
  total_critical_findings: number;

  @ApiProperty({ example: 5 })
  @Expose()
  @Transform(({ obj }) => obj.findings?.filter(f => f.severity === 'high').length || 0)
  total_high_findings: number;

  @ApiProperty({ example: 'En retard' })
  @Expose()
  @Transform(({ obj }) => {
    const statusLabels = {
      [DiligenceStatus.DRAFT]: 'Brouillon',
      [DiligenceStatus.IN_PROGRESS]: 'En cours',
      [DiligenceStatus.REVIEW]: 'En relecture',
      [DiligenceStatus.COMPLETED]: 'Terminée',
      [DiligenceStatus.CANCELLED]: 'Annulée'
    };
    return statusLabels[obj.status] || 'Inconnu';
  })
  status_label: string;
}

// DTO pour les listes
export class DiligenceListResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Due Diligence acquisition Société ABC' })
  @Expose()
  title: string;

  @ApiProperty({ enum: DiligenceType })
  @Expose()
  type: DiligenceType;

  @ApiProperty({ enum: DiligenceStatus })
  @Expose()
  status: DiligenceStatus;

  @ApiProperty({ enum: DiligencePriority })
  @Expose()
  priority: DiligencePriority;

  @ApiProperty({ example: '2026-04-15' })
  @Expose()
  deadline: Date;

  @ApiProperty({ example: 15 })
  @Expose()
  @Transform(({ obj }) => obj.dossier?.dossier_number)
  dossier_number: string;

  @ApiProperty({ example: 'ABC Corp' })
  @Expose()
  @Transform(({ obj }) => obj.dossier?.client?.company_name || obj.dossier?.client?.full_name)
  client_name: string;

  @ApiProperty({ example: 'Maître Sophie Martin' })
  @Expose()
  @Transform(({ obj }) => obj.assigned_lawyer?.full_name)
  assigned_lawyer_name: string;

  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => {
    const today = new Date();
    return new Date(obj.deadline) < today && obj.status !== DiligenceStatus.COMPLETED;
  })
  is_overdue: boolean;

  @ApiProperty({ example: 8 })
  @Expose()
  @Transform(({ obj }) => obj.findings?.length || 0)
  findings_count: number;

  @ApiProperty({ example: 45 })
  @Expose()
  progress_percentage: number;
}