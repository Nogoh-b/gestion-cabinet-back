import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DossierReferralSearchDto {
  @ApiPropertyOptional({ description: 'Filtrer par dossier' })
  @IsOptional()
  @IsInt()
  dossier_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer par apporteur' })
  @IsOptional()
  @IsInt()
  referrer_id?: number;

  @ApiPropertyOptional({ description: 'Date d\'apport minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  referral_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date d\'apport maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  referral_date_to?: Date;

  @ApiPropertyOptional({ description: 'Recherche texte (nom dossier, apporteur)' })
  @IsOptional()
  @IsString()
  search?: string;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'referral_date' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'referral_date';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}