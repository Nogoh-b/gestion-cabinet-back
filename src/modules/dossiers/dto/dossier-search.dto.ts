// src/modules/dossiers/dto/dossier-search.dto.ts
import {
  IsOptional, IsString, IsEnum, IsDateString,
  IsNumber, Min, Max
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

export class DossierSearchDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Terme de recherche général (client, avocat, etc.)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DossierStatus, description: 'Statut du dossier' })
  @IsOptional()
  @IsEnum(DossierStatus)
  status?: DossierStatus;

  @ApiPropertyOptional({ description: 'Identifiant du client (UUID)' })
  @IsOptional()
  @IsNumber()
  client_id?: number;

  @ApiPropertyOptional({ description: 'Identifiant de l’avocat (UUID)' })
  @IsOptional()
  @IsNumber()
  lawyer_id?: number;

  @ApiPropertyOptional({ description: 'Type de procédure (UUID)' })
  @IsOptional()
  @IsNumber()
  procedure_type_id?: number;

  @ApiPropertyOptional({ description: 'Sous-type de procédure (UUID)' })
  @IsOptional()
  @IsNumber()
  procedure_subtype_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer à partir de cette date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filtrer jusqu’à cette date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Juridiction concernée' })
  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @ApiPropertyOptional({ description: 'Nombre maximum de résultats par page', example: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  /*@ApiPropertyOptional({ description: 'Décalage (pagination)', example: 0, minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(0)
  offset?: number = 0;*/

  @ApiPropertyOptional({ description: 'Champ de tri (ex: created_at, status, etc.)', example: 'created_at' })
  @IsOptional()
  @IsString()
  sort_by?: string = 'created_at';

  @ApiPropertyOptional({ description: 'Tri descendant ?', example: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  sort_desc?: boolean = true;
}
