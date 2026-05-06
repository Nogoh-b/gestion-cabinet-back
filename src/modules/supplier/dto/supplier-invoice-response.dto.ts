import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, SupplierInvoiceStatus } from '../entities/supplier-invoice.entity';

export class SupplierInvoiceResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

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