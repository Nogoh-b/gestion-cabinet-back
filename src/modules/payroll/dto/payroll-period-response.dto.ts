import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriodStatus } from '../entities/payroll-period.entity';

export class PayrollPeriodResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Paie Mars 2026' })
  @Expose()
  label: string;

  @ApiProperty({ example: '2026-03-01' })
  @Expose()
  start_date: Date;

  @ApiProperty({ example: '2026-03-31' })
  @Expose()
  end_date: Date;

  @ApiProperty({ enum: PayrollPeriodStatus, example: PayrollPeriodStatus.VALIDATED })
  @Expose()
  status: PayrollPeriodStatus;

  // Relations
  @ApiProperty({ example: { id: 2, name: 'Cabinet Principal', code: 'BR-001' }, required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.branch ? { id: obj.branch.id, name: obj.branch.name, code: obj.branch.code } : null,
  )
  branch: { id: number; name: string; code: string } | null;

  // Computed
  @ApiProperty({ example: 12 })
  @Expose()
  @Transform(({ obj }) => obj.payslips?.length || 0)
  total_payslips: number;

  @ApiProperty({ example: 54000.0 })
  @Expose()
  @Transform(({ obj }) =>
    obj.payslips?.reduce((sum: number, p: any) => sum + Number(p.net_amount), 0) || 0,
  )
  total_net_amount: number;

  @ApiProperty({ example: 'Brouillon' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      validated: 'Validée',
      paid: 'Payée',
      cancelled: 'Annulée',
    };
    return labels[obj.status] || obj.status;
  })
  status_label: string;
}