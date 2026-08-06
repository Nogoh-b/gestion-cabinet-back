import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, SupplierInvoiceStatus } from '../entities/supplier-invoice.entity';

export class SupplierInvoiceResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @Expose()
  supplier_id: number;

  @ApiProperty({ example: 'FAC-2026-0452' })
  @Expose()
  invoice_number: string;

  @ApiProperty({ example: 'Abonnement internet fibre - Mars 2026' })
  @Expose()
  description: string;

  @ApiProperty({ example: '2026-03-15' })
  @Expose()
  invoice_date: Date;

  @ApiProperty({ example: '2026-04-15' })
  @Expose()
  due_date: Date;

  @ApiProperty({ example: 150.0 })
  @Expose()
  amount_ht: number;

  @ApiProperty({ example: 20.0 })
  @Expose()
  tax_rate: number;

  @ApiProperty({ example: 30.0 })
  @Expose()
  amount_tva: number;

  @ApiProperty({ example: 180.0 })
  @Expose()
  amount_ttc: number;

  @ApiProperty({ enum: SupplierInvoiceStatus, example: SupplierInvoiceStatus.PAID })
  @Expose()
  status: SupplierInvoiceStatus;

  @ApiProperty({ example: '2026-04-10', required: false })
  @Expose()
  payment_date: Date;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.VIREMENT, required: false })
  @Expose()
  payment_method: PaymentMethod;

  @Expose()
  payment_reference: string | null;

  @Expose()
  approved_by_id: number | null;

  @Expose()
  approved_at: Date | null;

  @Expose()
  paid_by_id: number | null;

  @Expose()
  branch_id: number | null;

  @Expose()
  created_by_id: number | null;

  @Expose()
  notes: string | null;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;

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

  @ApiProperty({ example: 'facture-fournisseur.pdf', required: false })
  @Expose()
  attachment_original_name: string | null;

  @ApiProperty({ example: 'application/pdf', required: false })
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

  // Relations
  @ApiProperty({
    example: { id: 1, company_name: 'Orange Business Services', supplier_code: 'SUP-001' },
  })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.supplier?.id,
    company_name: obj.supplier?.company_name,
    supplier_code: obj.supplier?.supplier_code,
    category: obj.supplier?.category,
  }))
  supplier: { id: number; company_name: string; supplier_code: string; category: string };

  @ApiProperty({ example: { id: 2, name: 'Cabinet Principal' }, required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.branch ? { id: obj.branch.id, name: obj.branch.name } : null,
  )
  branch: { id: number; name: string } | null;

  // Computed
  @ApiProperty({ example: false })
  @Expose()
  @Transform(({ obj }) => {
    if (obj.status === SupplierInvoiceStatus.PAID || obj.status === SupplierInvoiceStatus.CANCELLED) {
      return false;
    }
    const today = new Date();
    return new Date(obj.due_date) < today;
  })
  is_overdue: boolean;

  @ApiProperty({ example: 5 })
  @Expose()
  @Transform(({ obj }) => {
    if (obj.status === SupplierInvoiceStatus.PAID || obj.status === SupplierInvoiceStatus.CANCELLED) {
      return null;
    }
    const today = new Date();
    const due = new Date(obj.due_date);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  })
  days_until_due: number | null;

  @ApiProperty({ example: 'Payée' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      received: 'Reçue',
      approved: 'Approuvée',
      paid: 'Payée',
      cancelled: 'Annulée',
      disputed: 'Contestée',
    };
    return labels[obj.status] || obj.status;
  })
  status_label: string;
}
