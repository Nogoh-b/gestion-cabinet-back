import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ExpenseReportStatus } from '../entities/expense-report.entity';
import { ExpenseCategory } from '../entities/expense-line.entity';

export class ExpenseLineResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @Expose()
  expense_report_id: number;

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

  @Expose()
  tax_rate: number;

  @ApiProperty({ example: 144.0 })
  @Expose()
  amount_ttc: number;

  @ApiProperty({ example: true })
  @Expose()
  is_rebillable: boolean;

  @Expose()
  dossier_id: number | null;

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

  @ApiProperty({
    example: true,
    description: 'Indique si un justificatif privé est disponible',
  })
  @Expose()
  @Transform(
    ({ obj }) => Boolean(obj.attachment_url && obj.attachment_sha256),
    { toClassOnly: true },
  )
  has_attachment: boolean;

  @ApiProperty({ example: 'ticket-taxi.jpg', required: false })
  @Expose()
  attachment_original_name: string | null;

  @ApiProperty({ example: 'image/jpeg', required: false })
  @Expose()
  attachment_mime_type: string | null;

  @ApiProperty({
    example: '48231',
    required: false,
    description: 'Taille en octets, sérialisée comme chaîne pour préserver le bigint',
  })
  @Expose()
  attachment_size: string | null;

  @ApiProperty({
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    required: false,
  })
  @Expose()
  attachment_sha256: string | null;

  @ApiProperty({ enum: ExpenseReportStatus, required: false })
  @Expose()
  @Transform(
    ({ obj }) => obj.expense_report?.status ?? null,
    { toClassOnly: true },
  )
  expense_report_status: ExpenseReportStatus | null;
}

export class ExpenseReportResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @Expose()
  employee_id: number;

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

  @Expose()
  approved_by_id: number | null;

  @Expose()
  approved_at: Date | null;

  @Expose()
  rejected_at: Date | null;

  @Expose()
  rejection_reason: string | null;

  @Expose()
  reimbursement_method: string | null;

  @Expose()
  reimbursement_reference: string | null;

  @Expose()
  reimbursed_by_id: number | null;

  @Expose()
  notes: string | null;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

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

  @Expose()
  @Transform(({ obj }) =>
    obj.reimbursed_by
      ? {
          id: obj.reimbursed_by.id,
          full_name: obj.reimbursed_by.full_name,
        }
      : null,
  )
  reimbursed_by: { id: number; full_name: string } | null;

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
      tax_rate: line.tax_rate,
      amount_ttc: line.amount_ttc,
      is_rebillable: line.is_rebillable,
      dossier_id: line.dossier_id,
      dossier: line.dossier
        ? { id: line.dossier.id, dossier_number: line.dossier.dossier_number }
        : null,
      category_label: line.category_label,
      has_attachment: Boolean(
        line.attachment_url && line.attachment_sha256,
      ),
      attachment_original_name: line.attachment_original_name,
      attachment_mime_type: line.attachment_mime_type,
      attachment_size: line.attachment_size,
      attachment_sha256: line.attachment_sha256,
      expense_report_status: obj.status,
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
