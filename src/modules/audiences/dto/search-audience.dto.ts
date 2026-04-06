import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';



import { AudienceStatus, AudienceType1 } from '../entities/audience.entity';





export class AudienceSearchDto {
  @ApiPropertyOptional({ description: 'Filtrer par ID du dossier' })
  @IsOptional()
  @IsInt()
  dossier_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer par ID du Type Audience' })
  @IsOptional()
  @IsInt()
  audience_type_id?: number;

  @ApiPropertyOptional({ example: 'b9d6c1dd-664c-4924-b359-fd77337da47e', required: false })
  'sub_stage_id'?: string;

  @ApiPropertyOptional({ description: 'Filtrer par type d’audience', enum: AudienceType1 })
  @IsOptional()
  @IsEnum(AudienceType1)
  type?: AudienceType1;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: AudienceStatus })
  @IsOptional()
  @IsEnum(AudienceStatus)
  status?: AudienceStatus;

  @ApiPropertyOptional({ description: 'Filtrer par juridiction (texte partiel possible)' })
  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @ApiPropertyOptional({ description: 'Filtrer par nom du juge' })
  @IsOptional()
  @IsString()
  judge_name?: string;

  @ApiPropertyOptional({ description: 'Filtrer par résultat (favorable, défavorable, etc.)' })
  @IsOptional()
  @IsString()
  outcome?: string;

  @ApiPropertyOptional({ description: 'Date minimale (inclus)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_from?: Date;

  @ApiPropertyOptional({ description: 'Date maximale (inclus)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_to?: Date;

  @ApiPropertyOptional({ description: 'Recherche texte globale (juridiction, juge, notes...)' })
  @IsOptional()
  @IsString()
  search?: string;

  // 🔽 Pagination & tri optionnels
  @ApiPropertyOptional({ description: 'Page de résultats (défaut: 1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Taille de page (défaut: 10)', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Champ de tri (ex: "audience_date")' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'audience_date';

  @ApiPropertyOptional({ description: 'Ordre de tri ("ASC" ou "DESC")', example: 'ASC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'ASC';
}
