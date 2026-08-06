import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateReferralCommissionDto {
  @ApiPropertyOptional({ example: 'b1c2…uuid' })
  @IsUUID()
  @IsOptional()
  facture_id?: string | null;

  @ApiPropertyOptional({ example: 'a9f8…uuid' })
  @IsUUID()
  @IsOptional()
  paiement_id?: string | null;

  @ApiPropertyOptional({ example: 250000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ example: '2026-07-28' })
  @IsDateString()
  @IsOptional()
  calculation_date?: string;

  @ApiPropertyOptional({ example: 'Justification du calcul' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
