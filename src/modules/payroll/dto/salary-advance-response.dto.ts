import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SalaryAdvanceStatus } from '../entities/salary-advance.entity';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Demandée',
  approved: 'Approuvée',
  paid: 'Versée',
  recovered: 'Récupérée',
  cancelled: 'Annulée',
};

export class SalaryAdvanceResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 150000 })
  @Expose()
  amount: number;

  @ApiProperty({ example: 50000, description: "Part déjà récupérée sur des paies" })
  @Expose()
  recovered_amount: number;

  @ApiProperty({ example: 100000, description: "Reste à récupérer = montant − déjà récupéré" })
  @Expose()
  @Transform(({ obj }) =>
    Math.max(0, Math.round((Number(obj.amount || 0) - Number(obj.recovered_amount || 0)) * 100) / 100),
  )
  outstanding_amount: number;

  @ApiProperty({ example: '2026-06-15' })
  @Expose()
  date_granted: Date;

  @ApiProperty({ enum: SalaryAdvanceStatus, example: SalaryAdvanceStatus.PAID })
  @Expose()
  status: SalaryAdvanceStatus;

  @ApiProperty({ example: 'Versée' })
  @Expose()
  @Transform(({ obj }) => STATUS_LABELS[obj.status] || obj.status)
  status_label: string;

  @ApiProperty({ example: '2026-06-16', required: false })
  @Expose()
  payment_date: Date;

  @ApiProperty({ example: 'Avance exceptionnelle' })
  @Expose()
  reason: string;

  @ApiProperty({
    example: { id: 5, full_name: 'Maître Sophie Martin', employee_number: 'EMP-005', position: 'avocat' },
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.employee?.id,
    full_name: obj.employee?.full_name,
    employee_number: obj.employee?.employee_number,
    position: obj.employee?.position,
  }))
  employee: { id: number; full_name: string; employee_number: string; position: string };

  // Champs aplatis pour l'affichage en liste/tableau.
  @ApiProperty({ example: 'Maître Sophie Martin' })
  @Expose()
  @Transform(({ obj }) => obj.employee?.full_name)
  employee_name: string;

  @ApiProperty({ example: 'EMP-005' })
  @Expose()
  @Transform(({ obj }) => obj.employee?.employee_number)
  employee_number: string;

  @ApiProperty({ example: 'avocat' })
  @Expose()
  @Transform(({ obj }) => obj.employee?.position)
  employee_position: string;

  @ApiProperty({ example: '2026-06-15T10:00:00.000Z' })
  @Expose()
  created_at: Date;

  @ApiProperty({ example: '2026-06-15T10:00:00.000Z' })
  @Expose()
  updated_at: Date;
}
