import { IsOptional, IsInt, IsISO8601, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';














export class CreateSavingsAccountDto {

  balance: number;
  avalaible_balance: number;
  customer_code: string;

  @ApiProperty({ description: 'ID du client', example: 1 })
  @IsInt()
  customer_id: number;

  @ApiProperty({ description: 'ID du type de compte', example: 1 })
  @IsInt()
  type_savings_account_id: number;

  @ApiProperty({ description: 'ID du compte qui enrolle', example: 1 })
  @IsOptional()
  @IsNumber()
  enrolled_by_id?: number; 


  @ApiProperty({ description: 'ID du compte qui enrolle', example: '1' })
  @IsOptional()
  promo_code?: string; 

  code_commercial?: string; 

  /*@ApiProperty({ description: 'Statut du compte', example: 1 })
  @IsInt()*/
  status: number;

  @ApiProperty({ description: 'Code comertial', example: '127555' ,   type: String // Spécifier explicitement le type
 })
  @IsOptional()
  code_promo?: string;

 /* @ApiProperty({ description: 'IBAN du compte' })
  @IsString()
  @Length(1, 45)
  IBAN: string;*/

  /*@ApiProperty({ description: 'Code produit' })
  @IsString()*/
  location_city_id?: number;

  /*@ApiPropertyOptional({ description: 'Lien vers le wallet' })
  @IsOptional()
  @IsString()*/
  wallet_link?: string;  
  
  @ApiPropertyOptional({ description: 'Lien vers le wallet' })
  @IsOptional()
  created_online?: number;

  /*@ApiPropertyOptional({ description: 'Taux d’intérêt annuel spécifique' })
  @IsOptional()
  @IsNumber()
  interest_year_savings_account?: number;

  @ApiPropertyOptional({ description: 'Autre numéro de compte' })
  @IsOptional()
  @IsString()
  account_number?: string;*/

  @ApiProperty({ description: 'ID de la succursale', example: 1 })
  @IsInt()
  branch_id: number;
}

export class AddInterestRateToSavingAccountDto {
  @ApiProperty({ description: 'ID du taux d’intérêt', example: 1 })
  @IsInt()
  interestSavingAccountId: number;

  @ApiProperty({ description: 'Date de début d’application', type: String })
  @IsISO8601()
  begin_date: string;

  @ApiPropertyOptional({ description: 'Date de fin d’application', type: String })
  @IsOptional()
  @IsISO8601()
  end_date?: string;

  fee_savings: number = 0;
  amount_created: number = 0;
  
}

export class AssignInterestDto {
  @ApiProperty({ description: 'ID du plan d\'intérêt', example: 3 })
  @IsInt()
  interest_saving_account_id: number;
}


export class AssignInterestRangeDto {
  @ApiProperty({ description: 'Taux d’intérêt (%)', example: 3.5 })
  @IsNumber()
  rate: number;

  @ApiProperty({ description: 'Date de début (ISO)', example: '2025-06-01T00:00:00Z' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ description: 'Date de fin   (ISO)', example: '2026-06-01T00:00:00Z' })
  @IsDateString()
  end_date: string;
}


