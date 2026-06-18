// create-dossier-referral.dto.ts
import { IsNotEmpty, IsInt, IsNumber, IsEnum, IsDateString, IsOptional, IsString, Min, Max, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionBasis, CommissionMode } from '../entities/dossier-referral.entity';

export class CreateDossierReferralDto {
  @ApiProperty({ example: 15, description: 'ID du dossier' })
  @IsInt()
  @IsNotEmpty()
  dossier_id: number;

  @ApiProperty({ example: 3, description: 'ID de l\'apporteur' })
  @IsInt()
  @IsNotEmpty()
  referrer_id: number;

  @ApiPropertyOptional({ enum: CommissionMode, example: CommissionMode.RATE, description: 'Mode de calcul de la commission' })
  @IsEnum(CommissionMode)
  @IsOptional()
  commission_mode?: CommissionMode;

  @ApiPropertyOptional({ example: 10.0, description: 'Taux de commission (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @ValidateIf((dto) => !dto.commission_mode || dto.commission_mode === CommissionMode.RATE)
  @IsOptional()
  commission_rate?: number;

  @ApiPropertyOptional({ example: 25000, description: 'Montant fixe de commission' })
  @IsNumber()
  @Min(0)
  @ValidateIf((dto) => dto.commission_mode === CommissionMode.FIXED_AMOUNT)
  @IsOptional()
  commission_amount?: number;

  @ApiProperty({ enum: CommissionBasis, example: CommissionBasis.COLLECTED_HT })
  @IsEnum(CommissionBasis)
  @IsNotEmpty()
  commission_basis: CommissionBasis;

  @ApiProperty({ example: '2026-04-15', description: 'Date d\'apport' })
  @IsDateString()
  @IsNotEmpty()
  referral_date: Date;

  @ApiPropertyOptional({ example: 'Conditions spéciales...' })
  @IsString()
  @IsOptional()
  notes?: string;
}
