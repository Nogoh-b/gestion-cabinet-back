import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PayslipStatus } from '../entities/payslip.entity';
import { PayslipLineType } from '../entities/payslip-line.entity';

export class PayslipLineResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ enum: PayslipLineType, example: PayslipLineType.BASE_SALARY })
  @Expose()
  line_type: PayslipLineType;

  @ApiProperty({ example: 'Salaire de base - Mars 2026' })
  @Expose()
  label: string;

  @ApiProperty({ example: 4500.0 })
  @Expose()
  amount: number;

  @ApiProperty({ example: true })
  @Expose()
  is_taxable: boolean;

  @ApiProperty({ example: { id: 15, dossier_number: 'DOS-2026-015' }, required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.dossier ? { id: obj.dossier.id, dossier_number: obj.dossier.dossier_number } : null,
  )
  dossier: { id: number; dossier_number: string } | null;

  @ApiProperty({ example: '10% des honoraires du dossier #123' })
  @Expose()
  notes: string;

  @ApiProperty({ example: 'Salaire de base' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      base_salary: 'Salaire de base',
      bonus: 'Prime',
      internal_commission: 'Commission interne',
      deduction: 'Retenue',
      benefit: 'Avantage',
      overtime: 'Heures supplémentaires',
    };
    return labels[obj.line_type] || obj.line_type;
  })
  line_type_label: string;
}

export class PayslipResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 4500.0 })
  @Expose()
  gross_amount: number;

  @ApiProperty({ example: 3200.0 })
  @Expose()
  net_amount: number;

  @ApiProperty({ enum: PayslipStatus, example: PayslipStatus.PAID })
  @Expose()
  status: PayslipStatus;

  @ApiProperty({ example: '2026-04-01', required: false })
  @Expose()
  payment_date: Date;

  // Relations
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

  @ApiProperty({
    example: { id: 3, label: 'Paie Mars 2026', start_date: '2026-03-01', end_date: '2026-03-31' },
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.period?.id,
    label: obj.period?.label,
    start_date: obj.period?.start_date,
    end_date: obj.period?.end_date,
  }))
  period: {
    id: number;
    label: string;
    start_date: Date;
    end_date: Date;
  };

  // Lignes de paie
  @ApiProperty({ type: [PayslipLineResponseDto] })
  @Expose()
  @Transform(({ obj }) =>
    obj.lines?.map((line: any) => ({
      id: line.id,
      line_type: line.line_type,
      label: line.label,
      amount: line.amount,
      is_taxable: line.is_taxable,
      dossier: line.dossier
        ? { id: line.dossier.id, dossier_number: line.dossier.dossier_number }
        : null,
      notes: line.notes,
    })),
  )
  lines: PayslipLineResponseDto[];

  // Computed
  @ApiProperty({ example: 1300.0 })
  @Expose()
  @Transform(({ obj }) => Number(obj.gross_amount) - Number(obj.net_amount))
  total_deductions: number;

  @ApiProperty({ example: 500.0 })
  @Expose()
  @Transform(({ obj }) =>
    obj.lines
      ?.filter((l: any) => l.line_type === 'internal_commission')
      .reduce((sum: number, l: any) => sum + Number(l.amount), 0) || 0,
  )
  total_commissions: number;

  @ApiProperty({ example: 'Payée' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      validated: 'Validée',
      paid: 'Payée',
    };
    return labels[obj.status] || obj.status;
  })
  status_label: string;
}

// DTO pour les listes
export class PayslipListResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Maître Sophie Martin' })
  @Expose()
  @Transform(({ obj }) => obj.employee?.full_name)
  employee_name: string;

  @ApiProperty({ example: 'Paie Mars 2026' })
  @Expose()
  @Transform(({ obj }) => obj.period?.label)
  period_label: string;

  @ApiProperty({ example: 4500.0 })
  @Expose()
  gross_amount: number;

  @ApiProperty({ example: 3200.0 })
  @Expose()
  net_amount: number;

  @ApiProperty({ enum: PayslipStatus })
  @Expose()
  status: PayslipStatus;

  @ApiProperty({ example: 'Payée' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      validated: 'Validée',
      paid: 'Payée',
    };
    return labels[obj.status] || obj.status;
  })
  status_label: string;
}