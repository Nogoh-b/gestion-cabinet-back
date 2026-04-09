// src/facture/dto/search-facture.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDate, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { StatutFacture, TypeFacture } from './create-facture.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

export class SearchFactureDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Recherche globale' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'ID du dossier' })
  @IsString()
  @IsOptional()
  dossierId?: string;

  @ApiPropertyOptional({ example: 'b9d6c1dd-664c-4924-b359-fd77337da47e', required: false })
  'sub_stage_id'?: string;

  @ApiPropertyOptional({ description: 'ID du client' })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({ enum: StatutFacture, description: 'Statut de la facture' })
  @IsEnum(StatutFacture)
  @IsOptional()
  statut?: StatutFacture;

  @ApiPropertyOptional({ enum: TypeFacture, description: 'Type de facture' })
  @IsEnum(TypeFacture)
  @IsOptional()
  type?: TypeFacture;

  @ApiPropertyOptional({ description: 'Numéro de facture' })
  @IsString()
  @IsOptional()
  numero?: string;

  @ApiPropertyOptional({ description: 'Date de facture à partir de' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dateFacture_from?: Date;

  @ApiPropertyOptional({ description: 'Date de facture jusqu\'à' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dateFacture_to?: Date;

  @ApiPropertyOptional({ description: 'Date d\'échéance à partir de' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dateEcheance_from?: Date;

  @ApiPropertyOptional({ description: 'Date d\'échéance jusqu\'à' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dateEcheance_to?: Date;

  @ApiPropertyOptional({ description: 'Montant TTC minimum' })
  @IsNumber()
  @IsOptional()
  montantTTC_min?: number;

  @ApiPropertyOptional({ description: 'Montant TTC maximum' })
  @IsNumber()
  @IsOptional()
  montantTTC_max?: number;

  @ApiPropertyOptional({ description: 'IDs des factures' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ids?: string[];
}
