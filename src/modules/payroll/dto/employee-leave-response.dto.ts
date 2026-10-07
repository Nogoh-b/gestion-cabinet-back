import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EmployeeLeaveStatus } from '../entities/employee-leave.entity';

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};

/** Durée en jours calendaires, bornes incluses (0 si période invalide). */
function durationDays(start: unknown, end: unknown): number {
  if (!start || !end) return 0;
  const from = new Date(start as string).getTime();
  const to = new Date(end as string).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

export class EmployeeLeaveResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: '2026-07-01' })
  @Expose()
  start_date: Date;

  @ApiProperty({ example: '2026-07-10' })
  @Expose()
  end_date: Date;

  @ApiProperty({
    example: 10,
    description: 'Durée en jours calendaires (bornes incluses)',
  })
  @Expose()
  @Transform(({ obj }) => durationDays(obj.start_date, obj.end_date))
  duration_days: number;

  @ApiProperty({ example: 'Congé annuel' })
  @Expose()
  reason: string;

  @ApiProperty({
    enum: EmployeeLeaveStatus,
    example: EmployeeLeaveStatus.PENDING,
  })
  @Expose()
  status: EmployeeLeaveStatus;

  @ApiProperty({ example: 'En attente' })
  @Expose()
  @Transform(({ obj }) => STATUS_LABELS[obj.status] || obj.status)
  status_label: string;

  @ApiProperty({
    example: 'Période incompatible avec une audience',
    required: false,
  })
  @Expose()
  decision_reason: string;

  @ApiProperty({ example: 3, required: false })
  @Expose()
  decided_by: number;

  @ApiProperty({ example: '2026-06-20T10:00:00.000Z', required: false })
  @Expose()
  decided_at: Date;

  @ApiProperty({
    example: {
      id: 5,
      full_name: 'Maître Sophie Martin',
      employee_number: 'EMP-005',
      position: 'avocat',
    },
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.employee?.id,
    full_name: obj.employee?.full_name,
    employee_number: obj.employee?.employee_number,
    position: obj.employee?.position,
  }))
  employee: {
    id: number;
    full_name: string;
    employee_number: string;
    position: string;
  };

  // Champs aplatis pour l'affichage en liste/tableau.
  @ApiProperty({ example: 'Maître Sophie Martin' })
  @Expose()
  @Transform(({ obj }) => obj.employee?.full_name)
  employee_name: string;

  @ApiProperty({ example: 'EMP-005' })
  @Expose()
  @Transform(({ obj }) => obj.employee?.employee_number)
  employee_number: string;

  @ApiProperty({ example: '2026-06-15T10:00:00.000Z' })
  @Expose()
  created_at: Date;

  @ApiProperty({ example: '2026-06-15T10:00:00.000Z' })
  @Expose()
  updated_at: Date;
}
