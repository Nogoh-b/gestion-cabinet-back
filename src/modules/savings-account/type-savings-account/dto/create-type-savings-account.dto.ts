
import {
  IsOptional,
  IsString,
  IsNumber,
  IsInt, IsArray,
  ArrayNotEmpty, Length,
  Min,
  ArrayUnique
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



export class CreateTypeSavingsAccountDto {
  @ApiProperty({ description: 'Nom du type de compte' })
  @IsString()
  @Length(1, 45)
  name: string;

  @ApiProperty({ description: 'Code interne du type' })
  @IsString()
  @Length(1, 45)
  code: string;

  /*@ApiProperty({ description: 'Période de rémunération' })
  @IsString()*/
  periode: string;

  @ApiProperty({ description: 'Statut (actif/inactif)', example: 1 })
  @IsInt()
  status: number;

  /*@ApiPropertyOptional({ description: 'Taux d\'intérêt annuel par défaut' })
  @IsOptional()
  @IsString()*/
  interest_year_savings_account?: number = 0.0;

  /*@ApiPropertyOptional({ description: 'Durée minimale de blocage' })
  @IsOptional()
  @IsString()*/
  minimum_blocking_duration?: number = 0.0;

  /*@ApiPropertyOptional({ description: 'Dépôt initial minimum', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)*/
  initial_deposit?: number;

  @ApiPropertyOptional({ description: 'Solde minimum', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimum_balance?: number;

  @ApiPropertyOptional({ description: 'Solde d\'ouverture de compte', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  account_opening_fee?: number;

  @ApiPropertyOptional({ description: 'Commission par produit', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  commission_per_product?: number;


  @ApiPropertyOptional({ description: 'Reduction à la creation de compte si code promo', example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  promo_code_reduction?: number;
  
  @ApiPropertyOptional({ description: 'Fraix payer à l\'influenceur', example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  promo_code_fee?: number;

  @ApiPropertyOptional({ description: 'Coûts de maintenance mensuels', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_maintenance_costs?: number;

  @ApiPropertyOptional({ description: 'Frais de clôture', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  account_closure_fees?: number;

  @ApiProperty({ description: 'ID de la commission associée', example: 1 })
  @IsInt()
  commission_id: number;

  @ApiProperty({ description: 'creation en ligne ou pas', example: 0 })
  @IsInt()
  canCreateOnline: number;

  @ApiProperty({ description: 'ID du taux d’intérêt associé', example: 1 })
  @IsInt()
  interest_saving_account_id: number;
    @ApiProperty({ description: 'Liste des IDs de documents requis', example: [1, 2, 3] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  documentTypeIds: number[];

}

export class AddDocumentTypesToTypeDto {
  @ApiProperty({ description: 'Liste des IDs de types de documents à associer', isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  documentTypeIds: number[];
}
export class RemoveDocumentTypeFromTypeDto {
  @ApiProperty({ description: 'ID du type de document à retirer' })
  @IsInt()
  documentTypeId: number;
}