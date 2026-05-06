// referral-commission-response.dto.ts
import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CommissionStatus } from '../entities/referral-commission.entity';

export class ReferralCommissionResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @ApiProperty({ example: 2500.0 })
  @Expose()
  amount: number;

  @ApiProperty({ enum: CommissionStatus, example: CommissionStatus.PAID })
  @Expose()
  status: CommissionStatus;

  @ApiProperty({ example: '2026-04-28' })
  @Expose()
  calculation_date: Date;

  @ApiProperty({ example: '2026-05-02', required: false })
  @Expose()
  payment_date?: Date;

  @ApiProperty({ example: 'VIR-2026-042' })
  @Expose()
  payment_reference?: string;

  // Relations
  @ApiProperty({ example: { id: 1, dossier_id: 15, referrer: { company_name: 'Cabinet Dupont' } } })
  @Expose()
  @Transform(({ obj }) => ({
    id: obj.dossier_referral?.id,
    dossier_id: obj.dossier_referral?.dossier_id,
    referrer: {
      company_name: obj.dossier_referral?.referrer?.company_name,
    },
  }))
  dossier_referral: any;

  @ApiProperty({ example: { id: 25, numero: 'FAC-2026-025', montant_ttc: 25000.0 } })
  @Expose()
  @Transform(({ obj }) =>
    obj.facture
      ? { id: obj.facture.id, numero: obj.facture.numero, montant_ttc: obj.facture.montant_ttc }
      : null,
  )
  facture: any;
}