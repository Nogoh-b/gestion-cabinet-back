// create-referral-commission.dto.ts
import { IsNotEmpty, IsInt, IsNumber, IsDateString, IsOptional, IsString, IsUUID, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionStatus } from '../entities/referral-commission.entity';

export class CreateReferralCommissionDto {
  @ApiProperty({ example: 1, description: 'ID de l\'apport (dossier_referral)' })
  @IsInt()
  @IsNotEmpty()
  dossier_referral_id: number;

  @ApiPropertyOptional({ example: 'b1c2…uuid', description: 'ID (UUID) de la facture source' })
  @IsUUID()
  @IsOptional()
  facture_id?: string;

  @ApiPropertyOptional({ example: 'a9f8…uuid', description: 'ID (UUID) du paiement source' })
  @IsUUID()
  @IsOptional()
  paiement_id?: string;

  @ApiProperty({ example: 2500.0, description: 'Montant de la commission' })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: '2026-04-28', description: 'Date de calcul' })
  @IsDateString()
  @IsNotEmpty()
  calculation_date: Date;

  @ApiPropertyOptional({
    enum: CommissionStatus,
    example: CommissionStatus.CALCULATED,
    description: 'Statut initial de la commission',
  })
  @IsEnum(CommissionStatus)
  @IsOptional()
  status?: CommissionStatus;

  @ApiPropertyOptional({ example: 'Commission sur dossier ABC' })
  @IsString()
  @IsOptional()
  notes?: string;
}