// referral-commission-search.dto.ts
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionStatus } from '../entities/referral-commission.entity';

export class ReferralCommissionSearchDto {
  @ApiPropertyOptional({ description: 'Filtrer par apport (dossier_referral_id)' })
  @IsOptional()
  @IsInt()
  dossier_referral_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer par facture source' })
  @IsOptional()
  @IsInt()
  facture_id?: number;

  @ApiPropertyOptional({ enum: CommissionStatus })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiPropertyOptional({ description: 'Date de calcul minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  calculation_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date de calcul maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  calculation_date_to?: Date;

  @ApiPropertyOptional({ description: 'Commissions impayées uniquement' })
  @IsOptional()
  unpaid_only?: boolean;

  @ApiPropertyOptional({ description: 'Page', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Taille de page', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'calculation_date' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'calculation_date';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}