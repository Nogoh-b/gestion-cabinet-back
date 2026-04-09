// src/modules/invoice-type/dto/invoice-type-stats.dto.ts
import { Expose } from 'class-transformer';

export class InvoiceTypeUsageStatsDto {
  @Expose()
  totalInvoices: number;

  @Expose()
  totalAmount: number;

  @Expose()
  averagePerType: number;

  @Expose()
  mostUsedType: {
    id: number;
    name: string;
    count: number;
    amount: number;
  };

  @Expose()
  highestValueType: {
    id: number;
    name: string;
    count: number;
    amount: number;
  };
}
export class InvoiceTypeStatsDto {
  @Expose()
  total: number;

  @Expose()
  active: number;

  @Expose()
  inactive: number;

  @Expose()
  byCategory: InvoiceTypeCategoryStatsDto[];

  @Expose()
  byTaxRate: InvoiceTypeTaxRateStatsDto[];

  @Expose()
  topInvoiceTypes: TopInvoiceTypeDto[];

  @Expose()
  usageStats: InvoiceTypeUsageStatsDto;
}

export class InvoiceTypeCategoryStatsDto {
  @Expose()
  category: string;

  @Expose()
  code: string;

  @Expose()
  count: number;

  @Expose()
  percentage: number;

  @Expose()
  color?: string;
}

export class InvoiceTypeTaxRateStatsDto {
  @Expose()
  taxRate: number;

  @Expose()
  count: number;

  @Expose()
  percentage: number;

  @Expose()
  totalInvoices?: number;

  @Expose()
  totalAmount?: number;
}

export class TopInvoiceTypeDto {
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  name: string;

  @Expose()
  category: string;

  @Expose()
  invoicesCount: number;

  @Expose()
  totalAmount: number;

  @Expose()
  isActive: boolean;
}
