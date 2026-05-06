// create-referral-commission.dto.ts
import { IsNotEmpty, IsInt, IsNumber, IsDateString, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReferralCommissionDto {
  @ApiProperty({ example: 1, description: 'ID de l\'apport (dossier_referral)' })
  @IsInt()
  @IsNotEmpty()
  dossier_referral_id: number;

  @ApiPropertyOptional({ example: 25, description: 'ID de la facture source' })
  @IsInt()
  @IsOptional()
  facture_id?: number;

  @ApiPropertyOptional({ example: 12, description: 'ID du paiement source' })
  @IsInt()
  @IsOptional()
  paiement_id?: number;

  @ApiProperty({ example: 2500.0, description: 'Montant de la commission' })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: '2026-04-28', description: 'Date de calcul' })
  @IsDateString()
  @IsNotEmpty()
  calculation_date: Date;

  @ApiPropertyOptional({ example: 'Commission sur dossier ABC' })
  @IsString()
  @IsOptional()
  notes?: string;
}