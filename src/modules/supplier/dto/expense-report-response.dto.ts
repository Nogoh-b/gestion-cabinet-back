import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ExpenseReportStatus } from '../entities/expense-report.entity';
import { ExpenseCategory } from '../entities/expense-line.entity';

export class ExpenseLineResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: '2026-04-08' })
  @Expose()
  expense_date: Date;

  @ApiProperty({ example: 'Train Paris-Lyon A/R' })
  @Expose()
  description: string;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.TRANSPORT })
  @Expose()
  category: ExpenseCategory;

  @ApiProperty({ example: 120.0 })
  @Expose()
  amount_ht: number;

  @ApiProperty({ example: 144.0 })
  @Expose()
  amount_ttc: number;

  @ApiProperty({ example: true })
  @Expose()
  is_rebillable: boolean;

  @ApiProperty({ example: { id: 15, dossier_number: 'DOS-2026-015' }, required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.dossier ? { id: obj.dossier.id, dossier_number: obj.dossier.dossier_number } : null,
  )
  dossier: { id: number; dossier_number: string } | null;

  @ApiProperty({ example: 'Transport' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      transport: 'Transport',
      accommodation: 'Hébergement',
      meal: 'Repas',
      bailiff: 'Huissier',
      court_fees: 'Frais de justice',
      office_supplies: 'Fournitures',
      other: 'Autre',
    };
    return labels[obj.category] || obj.category;
  })
  category_label: string;
}

export class ExpenseReportResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'Déplacement Tribunal Commerce - Dossier #123' })
  @Expose()
  title: string;

  @ApiProperty({ enum: ExpenseReportStatus, example: ExpenseReportStatus.APPROVED })
  @Expose()
  status: ExpenseReportStatus;

  @ApiProperty({ example: 245.50 })
  @Expose()
  total_amount: number;

  @ApiProperty({ example: '2026-04-10' })
  @Expose()
  submission_date: Date;

  @ApiProperty({ example: '2026-04-12', required: false })
  @Expose()
  reimbursement_date: Date;

  // Relations
  @ApiProperty({
    example: { id: 5, full_name: 'Maître Sophie Martin', employee_number: 'EMP-005' },
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.employee?.id,
    full_name: obj.employee?.full_name,
    employee_number: obj.employee?.employee_number,
  }))
  employee: { id: number; full_name: string; employee_number: string };

  @ApiProperty({
    example: { id: 3, full_name: 'Me Jean Martin' },
    required: false,
  })
  @Expose()
  @Transform(({ obj }) =>
    obj.approved_by ? { id: obj.approved_by.id, full_name: obj.approved_by.full_name } : null,
  )
  approved_by: { id: number; full_name: string } | null;

  // Lignes
  @ApiProperty({ type: [ExpenseLineResponseDto] })
  @Expose()
  @Transform(({ obj }) =>
    obj.lines?.map((line: any) => ({
      id: line.id,
      expense_date: line.expense_date,
      description: line.description,
      category: line.category,
      amount_ht: line.amount_ht,
      amount_ttc: line.amount_ttc,
      is_rebillable: line.is_rebillable,
      dossier: line.dossier
        ? { id: line.dossier.id, dossier_number: line.dossier.dossier_number }
        : null,
    })),
  )
  lines: ExpenseLineResponseDto[];

  // Computed
  @ApiProperty({ example: 3 })
  @Expose()
  @Transform(({ obj }) => obj.lines?.length || 0)
  total_lines: number;

  @ApiProperty({ example: 100.0 })
  @Expose()
  @Transform(({ obj }) =>
    obj.lines
      ?.filter((l: any) => l.is_rebillable)
      .reduce((sum: number, l: any) => sum + Number(l.amount_ttc), 0) || 0,
  )
  total_rebillable: number;

  @ApiProperty({ example: 'Approuvée' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      submitted: 'Soumise',
      approved: 'Approuvée',
      rejected: 'Rejetée',
      reimbursed: 'Remboursée',
    };
    return labels[obj.status] || obj.status;
  })
  status_label: string;
}