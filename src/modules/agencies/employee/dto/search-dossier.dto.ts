// src/modules/dossiers/dto/search-dossier.dto.ts

import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { DangerLevel } from 'src/modules/dossiers/entities/dossier.entity';


export class SearchEmployeeDto extends PaginationParamsDto  {

e

  /* ============================
   * FILTRES PRINCIPAUX
   * ============================ */
  @IsOptional()
  @IsEnum(DossierStatus)
  status?: DossierStatus;

  @IsOptional()
  @IsEnum(DangerLevel)
  danger_level?: DangerLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  client_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lawyer_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  jurisdiction_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  procedure_type_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  procedure_subtype_id?: number;

  /* ============================
   * FILTRES DATES
   * ============================ */
  @IsOptional()
  @IsDateString()
  opening_date_from?: string;

  @IsOptional()
  @IsDateString()
  opening_date_to?: string;

  @IsOptional()
  @IsDateString()
  closing_date_from?: string;

  @IsOptional()
  @IsDateString()
  closing_date_to?: string;

  /* ============================
   * FILTRES BOOLEENS
   * ============================ */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  appeal_possibility?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_archived?: boolean;
}
