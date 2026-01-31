import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { InvoiceTypeCategory, TaxRate } from '../entities/invoice-type.entity';


export class InvoiceTypeResponseDto {
  @ApiProperty()
  @Expose()
  id: number;

  @ApiProperty()
  @Expose()
  code: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiPropertyOptional()
  @Expose()
  description: string;

  @ApiProperty({ enum: InvoiceTypeCategory })
  @Expose()
  category: InvoiceTypeCategory;

  @ApiProperty({ enum: TaxRate })
  @Expose()
  default_tax_rate: TaxRate;

  @ApiProperty()
  @Expose()
  is_billable: boolean;

  @ApiProperty()
  @Expose()
  requires_approval: boolean;

  @ApiProperty()
  @Expose()
  default_payment_days: number;

  @ApiProperty()
  @Expose()
  is_active: boolean;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.accounting_code)
  accounting_code?: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.default_unit)
  default_unit?: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.default_price)
  default_price?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.vat_exempt)
  vat_exempt?: boolean;

  @ApiProperty()
  @Expose()
  created_at: Date;

  @ApiProperty()
  @Expose()
  updated_at: Date;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.invoices?.length || 0)
  invoice_count: number;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const categoryLabels = {
      [InvoiceTypeCategory.LEGAL_FEES]: 'Honoraires',
      [InvoiceTypeCategory.EXPENSES]: 'Frais',
      [InvoiceTypeCategory.ADVANCE]: 'Acompte',
      [InvoiceTypeCategory.SETTLEMENT]: 'Règlement',
      [InvoiceTypeCategory.OTHER]: 'Autre'
    };
    return categoryLabels[obj.category] || 'Inconnu';
  })
  category_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const rateLabels = {
      [TaxRate.ZERO]: '0%',
      [TaxRate.REDUCED]: '5.5%',
      [TaxRate.INTERMEDIATE]: '10%',
      [TaxRate.STANDARD]: '20%'
    };
    return rateLabels[obj.default_tax_rate] || '0%';
  })
  tax_rate_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => `${obj.default_payment_days} jours`)
  payment_days_formatted: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    if (obj.metadata?.default_unit === 'hour') return 'Heure';
    if (obj.metadata?.default_unit === 'day') return 'Jour';
    if (obj.metadata?.default_unit === 'unit') return 'Unité';
    if (obj.metadata?.default_unit === 'fixed') return 'Forfait';
    return 'Non spécifié';
  })
  unit_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    if (obj.metadata?.default_price) {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR'
      }).format(obj.metadata.default_price);
    }
    return 'Non défini';
  })
  price_formatted: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.vat_exempt ? 'Exonéré' : 'Taxable')
  vat_status_label: string;
}