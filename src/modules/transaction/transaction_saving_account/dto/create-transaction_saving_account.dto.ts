// DTO de création - src/core-banking/dto/create-transaction-savings-account.dto.ts
// Format des données pour créer une transaction épargne
import { IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';





export class CreateTransactionSavingsAccountDto {
  @ApiProperty({ example: 1000.00, description: 'Montant de la transaction' })
  @IsNumber()
  @Min(0)
  amount: number;


  @ApiPropertyOptional({ example: '8629891', description: 'Code d\'origine' })
  @IsString()
  origin_savings_account_code: string;          // code du compte épargne source

  @ApiPropertyOptional({ example: '8623907', description: 'Code de destination' })
  @IsString()
  target_savings_account_code?: string;         // code du compte épargne cible (pour INTERNAL_TRANSFER)

                             // montant de la transaction


  /*@ApiPropertyOptional({ example: 'MOMO', description: 'Code d\'origine' })
  @IsOptional()
  @IsString()*/
  origin_code_transaction?: string;

  /*@ApiPropertyOptional({ example: 'EXT_ACT_123', description: 'ID activité externe' })
  @IsOptional()
  @IsString()*/
  external_activities_id?: string;

  /*@ApiPropertyOptional({ example: 'EXT_ACC_456', description: 'Numéro compte externe' })
  @IsOptional()
  @IsString()
  external_savings_account_number?: string;*/



  /*@ApiProperty({ example: 2, description: 'ID du canal de transaction' })
  @IsInt()*/
  channels_transaction_id: number;

  /*@ApiProperty({ example: 'MOMO', description: 'Code du provider' })
  @IsString()
  provider_code: string;

  @ApiProperty({ example: 3, description: 'ID du type de transaction' })
  @IsInt()
  transaction_type_id: number;*/
}