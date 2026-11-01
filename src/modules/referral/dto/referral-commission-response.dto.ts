import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  CommissionPaymentMethod,
  CommissionStatus,
} from '../entities/referral-commission.entity';

const STATUS_LABELS: Record<CommissionStatus, string> = {
  [CommissionStatus.CALCULATED]: 'Calculée',
  [CommissionStatus.APPROVED]: 'Approuvée',
  [CommissionStatus.PAID]: 'Payée',
  [CommissionStatus.CANCELLED]: 'Annulée',
};

export class ReferralCommissionResponseDto {
  @ApiProperty({ example: 1 })
  @Expose()
  id: number;

  @Expose()
  dossier_referral_id: number;

  @Expose()
  facture_id: string | null;

  @Expose()
  paiement_id: string | null;

  @ApiProperty({ example: 250000 })
  @Expose()
  @Transform(({ value }) => Number(value ?? 0))
  amount: number;

  @ApiProperty({ enum: CommissionStatus })
  @Expose()
  status: CommissionStatus;

  @Expose()
  @Transform(({ obj }) => obj.status_label ?? STATUS_LABELS[obj.status])
  status_label: string;

  @Expose()
  calculation_date: Date;

  @Expose()
  payment_date: Date | null;

  @ApiPropertyOptional({ enum: CommissionPaymentMethod })
  @Expose()
  payment_method: CommissionPaymentMethod | null;

  @Expose()
  payment_reference: string | null;

  @Expose()
  notes: string | null;

  @Expose()
  calculated_by_id: number | null;

  @Expose()
  approved_by_id: number | null;

  @Expose()
  approved_at: Date | null;

  @Expose()
  paid_by_id: number | null;

  @Expose()
  cancelled_by_id: number | null;

  @Expose()
  cancelled_at: Date | null;

  @Expose()
  cancellation_reason: string | null;

  @Expose()
  @Transform(({ obj }) => obj.referrer_name ?? null)
  referrer_name: string | null;

  @Expose()
  @Transform(({ obj }) => obj.dossier_number ?? null)
  dossier_number: string | null;

  @Expose()
  @Transform(({ obj }) => {
    const referral = obj.dossier_referral;
    if (!referral) return null;
    return {
      id: referral.id,
      dossier_id: referral.dossier_id,
      dossier: referral.dossier
        ? {
            id: referral.dossier.id,
            dossier_number: referral.dossier.dossier_number,
            object: referral.dossier.object,
          }
        : null,
      referrer: referral.referrer
        ? {
            id: referral.referrer.id,
            company_name: referral.referrer.company_name,
            contact_name: referral.referrer.contact_name,
          }
        : null,
    };
  })
  dossier_referral: Record<string, any> | null;

  @Expose()
  @Transform(({ obj }) =>
    obj.facture
      ? {
          id: obj.facture.id,
          numero: obj.facture.numero,
          dossier_id: obj.facture.dossier_id,
          montantHT: Number(obj.facture.montantHT ?? 0),
          montantTTC: Number(obj.facture.montantTTC ?? 0),
          status: obj.facture.status,
        }
      : null,
  )
  facture: Record<string, any> | null;

  @Expose()
  @Transform(({ obj }) =>
    obj.paiement
      ? {
          id: obj.paiement.id,
          factureId: obj.paiement.factureId,
          montant: Number(obj.paiement.montant ?? 0),
          status: obj.paiement.status,
          datePaiement: obj.paiement.datePaiement,
          reference: obj.paiement.reference,
        }
      : null,
  )
  paiement: Record<string, any> | null;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
