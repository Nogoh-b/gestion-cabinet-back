import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SupplierCategory } from '../entities/supplier.entity';

export class SupplierResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'SUP-001' })
  @Expose()
  supplier_code: string;

  @ApiProperty({ example: 'Orange Business Services' })
  @Expose()
  company_name: string;

  @ApiProperty({ enum: SupplierCategory, example: SupplierCategory.INTERNET })
  @Expose()
  category: SupplierCategory;

  @ApiProperty({ example: 'Jean Dupont' })
  @Expose()
  contact_name: string;

  @ApiProperty({ example: 'contact@orange.fr' })
  @Expose()
  email: string;

  @ApiProperty({ example: '+33 1 23 45 67 89' })
  @Expose()
  phone: string;

  @ApiProperty({ example: true })
  @Expose()
  status: boolean;

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
  @Transform(({ obj }) => obj.invoices?.length || 0)
  total_invoices: number;

  @ApiProperty({ example: 4500.0 })
  @Expose()
  @Transform(({ obj }) =>
    obj.invoices?.reduce((sum: number, inv: any) => sum + Number(inv.amount_ttc), 0) || 0,
  )
  total_amount_ttc: number;

  @ApiProperty({ example: 'Internet' })
  @Expose()
  @Transform(({ obj }) => {
    const labels: Record<string, string> = {
      internet: 'Internet',
      electricity: 'Électricité',
      rent: 'Loyer',
      supplies: 'Fournitures',
      software: 'Logiciel',
      bailiff: 'Huissier',
      insurance: 'Assurance',
      maintenance: 'Maintenance',
      other: 'Autre',
    };
    return labels[obj.category] || obj.category;
  })
  category_label: string;
}