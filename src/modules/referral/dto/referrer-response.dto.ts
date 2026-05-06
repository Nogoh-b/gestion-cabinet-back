// referrer-response.dto.ts
import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ReferrerPaymentMethod, ReferrerType } from '../entities/referral.entity';

export class ReferrerResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 'REF-001' })
  @Expose()
  referrer_code: string;

  @ApiProperty({ enum: ReferrerType, example: ReferrerType.LAWYER })
  @Expose()
  referrer_type: ReferrerType;

  @ApiProperty({ example: false })
  @Expose()
  is_internal: boolean;

  @ApiProperty({ example: 'Cabinet Dupont & Associés' })
  @Expose()
  company_name: string;

  @ApiProperty({ example: 'Jean Martin' })
  @Expose()
  contact_name: string;

  @ApiProperty({ example: 'contact@cabinet-dupont.fr' })
  @Expose()
  email: string;

  @ApiProperty({ example: '+33 1 23 45 67 89' })
  @Expose()
  phone: string;

  @ApiProperty({ example: 10.0 })
  @Expose()
  default_commission_rate: number;

  @ApiProperty({ enum: ReferrerPaymentMethod, example: ReferrerPaymentMethod.VIREMENT })
  @Expose()
  payment_method: ReferrerPaymentMethod;

  @ApiProperty({ example: 'BNP Paribas' })
  @Expose()
  bank_name: string;

  @ApiProperty({ example: 'FR76 3000...' })
  @Expose()
  bank_iban: string;

  @ApiProperty({ example: true })
  @Expose()
  status: boolean;

  // Relations transformées
  @ApiProperty({ example: { id: 5, full_name: 'Me Sophie Martin' }, required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.employee ? { id: obj.employee.id, full_name: obj.employee.full_name } : null,
  )
  employee: { id: number; full_name: string } | null;

  @ApiProperty({ example: { id: 12, full_name: 'Jean Dupont' }, required: false })
  @Expose()
  @Transform(({ obj }) =>
    obj.customer ? { id: obj.customer.id, full_name: obj.customer.full_name } : null,
  )
  customer: { id: number; full_name: string } | null;

  // Computed
  @ApiProperty({ example: 15 })
  @Expose()
  @Transform(({ obj }) => obj.dossier_referrals?.length || 0)
  total_dossiers: number;
}