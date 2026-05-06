// dossier-referral-response.dto.ts
import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CommissionBasis } from '../entities/dossier-referral.entity';

export class DossierReferralResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 15 })
  @Expose()
  dossier_id: number;

  @ApiProperty({ example: 10.0 })
  @Expose()
  commission_rate: number;

  @ApiProperty({ enum: CommissionBasis })
  @Expose()
  commission_basis: CommissionBasis;

  @ApiProperty({ example: '2026-04-15' })
  @Expose()
  referral_date: Date;

  // Relations
  @ApiProperty({ example: { id: 15, dossier_number: 'DOS-2026-015', object: 'Litige ABC' } })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.dossier?.id,
    dossier_number: obj.dossier?.dossier_number,
    object: obj.dossier?.object,
  }))
  dossier: { id: number; dossier_number: string; object: string };

  @ApiProperty({ example: { id: 3, company_name: 'Cabinet Dupont', referrer_code: 'REF-003' } })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.referrer?.id,
    company_name: obj.referrer?.company_name,
    referrer_code: obj.referrer?.referrer_code,
  }))
  referrer: { id: number; company_name: string; referrer_code: string };

  // Computed
  @ApiProperty({ example: 2500.0 })
  @Expose()
  @Transform(({ obj }) =>
    obj.commissions
      ?.filter((c) => c.status === 'paid')
      .reduce((sum, c) => sum + Number(c.amount), 0) || 0,
  )
  total_paid_commissions: number;

  @ApiProperty({ example: 1500.0 })
  @Expose()
  @Transform(({ obj }) =>
    obj.commissions
      ?.filter((c) => c.status === 'calculated' || c.status === 'approved')
      .reduce((sum, c) => sum + Number(c.amount), 0) || 0,
  )
  total_pending_commissions: number;
}