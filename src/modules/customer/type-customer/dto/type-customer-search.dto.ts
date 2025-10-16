// src/modules/dossiers/dto/dossier-search.dto.ts
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';


export class TypeCustomerSearchDto extends PaginationParamsDto {
  @ApiPropertyOptional({ description: 'Terme de recherche général (client, avocat, etc.)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DossierStatus, description: 'Statut du dossier' })
  @IsOptional()
  @IsEnum(DossierStatus)
  status?: DossierStatus;
}
