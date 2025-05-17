import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsOptional,
    IsString,
    IsNumber,
    IsInt, IsISO8601,
    Length
} from 'class-validator';

export class CreateSavingsAccountDto {
  @ApiProperty({ description: 'Numéro du compte épargne' })
  @IsString()
  @Length(1, 45)
  number_savings_account: string;

  @ApiProperty({ description: 'Frais du compte' })
  @IsNumber()
  fee_savings: number;

  @ApiProperty({ description: 'Montant initial' })
  @IsNumber()
  amount_created: number;

  @ApiProperty({ description: 'Solde initial' })
  @IsNumber()
  balance_init_savings_account: number;

  @ApiProperty({ description: 'ID du client', example: 1 })
  @IsInt()
  customer_id: number;

  @ApiProperty({ description: 'ID du type de compte', example: 1 })
  @IsInt()
  type_savings_account_id: number;

  @ApiProperty({ description: 'Statut du compte', example: 1 })
  @IsInt()
  status: number;

  @ApiProperty({ description: 'IBAN du compte' })
  @IsString()
  @Length(1, 45)
  IBAN: string;

  @ApiProperty({ description: 'Code produit' })
  @IsString()
  code_product: string;

  @ApiPropertyOptional({ description: 'Lien vers le wallet' })
  @IsOptional()
  @IsString()
  wallet_link?: string;

  @ApiPropertyOptional({ description: 'Taux d’intérêt annuel spécifique' })
  @IsOptional()
  @IsNumber()
  interest_year_savings_account?: number;

  @ApiPropertyOptional({ description: 'Autre numéro de compte' })
  @IsOptional()
  @IsString()
  account_number?: string;

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
}



