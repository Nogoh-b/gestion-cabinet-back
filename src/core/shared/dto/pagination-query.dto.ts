// src/common/dto/pagination-query.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsBoolean, IsString, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';


















export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Numéro de page', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d’éléments par page', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'Terme de recherche (exact ou LIKE selon exact)',
    example: 'Mendo',
  })
  @IsOptional()
  @IsString()
  term?: string;

  @ApiPropertyOptional({
    description: "Champs ciblés (CSV) ; si omis, recherche sur tous les champs texte",
    example: 'name,email',
  })
  @IsOptional()
  @IsString()
  fields?: string;

  @ApiPropertyOptional({
    description: 'Recherche exacte (=) ou partielle (LIKE)',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  exact: boolean = false;

  @ApiPropertyOptional({
    description: 'Date de début du filtre (inclusive)',
    example: '2025-01-01',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  from?: Date;

  @ApiPropertyOptional({
    description: 'Date de fin du filtre (inclusive)',
    example: '2029-06-30',
    type: String,
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  to?: Date;

  @ApiPropertyOptional({ description: 'status', example: 1 })
  @IsOptional()
  @IsInt()
  status: number = 1;

  fieldList : string [];
  isExact :boolean = false;
  
}



export class PaginationQueryTxDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Code du type de transaction',
    enum: ['0', '1'],        // Swagger affichera un select avec ces valeurs
  })
  @IsOptional()
  @IsIn(['0', '1'])
  type?: string; // Pour txTypeCode

  @ApiPropertyOptional({
    description: 'Filtrer uniquement les transactions de crédit',
    enum: ['MOMO', 'OM', 'INTERNAL', 'SAVING_PROJECT'],         // Swagger affichera un select true/false
  })
  @IsOptional()
  @IsBoolean()
  @IsIn(['MOMO', 'OM', 'INTERNAL', 'SAVING_PROJECT'])
  txType?: string; // Pour txTypeCode
}