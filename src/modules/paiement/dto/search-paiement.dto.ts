
// src/paiement/dto/search-paiement.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDate, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ModePaiement, StatutPaiement } from './create-paiement.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

export class SearchPaiementDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Recherche globale' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'ID de la facture' })
  @IsNumber()
  @IsOptional()
  factureId?: number;

  @ApiPropertyOptional({ description: 'ID du client' })
  @IsNumber()
  @IsOptional()
  clientId?: number;

  @ApiPropertyOptional({ enum: ModePaiement, description: 'Mode de paiement' })
  @IsEnum(ModePaiement)
  @IsOptional()
  mode?: ModePaiement;

  @ApiPropertyOptional({ enum: StatutPaiement, description: 'Statut du paiement' })
  @IsEnum(StatutPaiement)
  @IsOptional()
  statut?: StatutPaiement;

  @ApiPropertyOptional({ description: 'Référence du paiement' })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ description: 'Date de paiement à partir de' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  datePaiement_from?: Date;

  @ApiPropertyOptional({ description: 'Date de paiement jusqu\'à' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  datePaiement_to?: Date;

  @ApiPropertyOptional({ description: 'Montant minimum' })
  @IsNumber()
  @IsOptional()
  montant_min?: number;

  @ApiPropertyOptional({ description: 'Montant maximum' })
  @IsNumber()
  @IsOptional()
  montant_max?: number;

  @ApiPropertyOptional({ description: 'IDs des paiements' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ids?: string[];
}
