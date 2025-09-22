// src/common/dto/pagination-query.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, IsBoolean, IsString, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FilterTxOptions } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';

















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
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  to1?: Date;

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
  @IsIn(['MOMO', 'OM', 'INTERNAL'])
  txType?: string; // Pour txTypeCode 
  @IsOptional()
  @IsBoolean()
  @IsIn(['MOMO', 'OM', 'INTERNAL'])
  txType1?: string; // Pour txTypeCode  

  @IsOptional()
  @IsBoolean()
  @IsIn(['MOMO', 'OM', 'INTERNAL'])
  fieldsTx?: FilterTxOptions; // Pour txTypeCode
  
  txTypeCode?: string;
  tx_project_id?: number;
  step_saving_project?: number;
  tx_type?: string;
  id?: number;
  countLockeckTx?: boolean;
  promo_code?: string;
  commercial_code?: number;
}

export class PaginationQueryCustomerDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Code du type de transaction',
  })
  @IsOptional()
  type_code?: string; // Pour txTypeCode

}