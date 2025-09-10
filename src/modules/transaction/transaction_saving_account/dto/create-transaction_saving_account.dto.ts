// DTO de création - src/core-banking/dto/create-transaction-savings-account.dto.ts
// Format des données pour créer une transaction épargne
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';





import { TransactionCode } from '../../transaction_type/entities/transaction_type.entity';





















export class CreateTransactionSavingsAccountDto {
  @ApiProperty({ example: 1000.0, description: 'Montant de la transaction' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 1000, description: 'Montant de la commission' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  commission: number;
  day_before_withdraw?: number;

  @ApiProperty({ example: 1, description: 'ID Ressource' })
  @IsNumber()
  @IsOptional()
  ressource_id: number;

  @ApiProperty({ example: 1, description: '' })
  @IsNumber()
  branch_id: number;

  token?: string;
  tx_parent_id?: number;
  tx_type?: TransactionCode;

  @ApiPropertyOptional({ example: '8629891', description: "Code d'origine" })
  @IsString()
  origin_savings_account_code: string; // code du compte épargne source

  @ApiPropertyOptional({
    example: '8623907',
    description: 'Code de destination',
  })
  @IsString()
  target_savings_account_code?: string; // code du compte épargne cible (pour INTERNAL_TRANSFER)

  // montant de la transaction

  is_locked: boolean; // true si la transaction est bloquée, false sinon

  origin_code_transaction?: string;
  origin?: string;
  target?: string;
  loanId?: number;

  external_activities_id?: string;

  status: number;
  provider?: string;

  tx_project_id?: number;
  force_validate?: boolean;
  /*@ApiProperty({ example: 2, description: 'ID du canal de transaction' })
  @IsInt()*/
  channels_transaction_id: number;
}

export class CreateCreditTransactionSavingsAccountDto {
  @ApiProperty({ example: 1000.0, description: 'Montant de la transaction' })
  @IsNumber()
  @Min(0)
  amount: number;
  @ApiPropertyOptional({
    example: '8629891',
    description: 'Code de destination',
  })
  @IsString()
  target_savings_account_code?: string; // code du compte épargne cible (pour INTERNAL_TRANSFER)
  origin_savings_account_code?: string;
  @ApiPropertyOptional({
    example: false,
    description: 'Si la transaction est bloquée ou pas',
  })
  @IsBoolean()
  is_locked: boolean;
  force_validate?: boolean;

  status: number;

  origin?: string;
  target?: string;
  loanId?: number;
  tx_type?: TransactionCode;
  @ApiProperty({ example: 1000, description: 'Montant de la commission' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  commission: number;
  // true si la transaction est bloquée, false sinon
  token?: string;
  provider?: string;

  @ApiProperty({ example: 1, description: '' })
  @IsNumber()
  branch_id: number;
  tx_project_id?: number;
}

export class CreateDebitTransactionSavingsAccountDto {
  @ApiProperty({ example: 1000.0, description: 'Montant de la transaction' })
  @IsNumber()
  @Min(0)
  amount: number;
  token?: string;
  commission: number;
  origin?: string;
  provider?: string;
  target?: string;
  tx_type?: TransactionCode;
  loanId?: number;

  @ApiProperty({ example: 1, description: '' })
  @IsNumber()
  branch_id: number;
  status: number;
  force_validate?: boolean;

  @ApiPropertyOptional({ example: '8629891', description: "Code d'origine" })
  @IsString()
  origin_savings_account_code: string; // code du compte épargne source

  target_savings_account_code?: string; // code du compte épargne cible (pour INTERNAL_TRANSFER)

  is_locked: boolean; // true si la transaction est bloquée, false sinon

  origin_code_transaction?: string;
  tx_project_id?: number;
}

export class ValidateTransactionSavingsAccountDto {
  @ApiProperty({
    example: '999e9a89-49a7-48e5-9f77-1b24aded1861',
    description: 'paymentCode(unique)',
    required: false,
  })
  @IsString()
  @IsOptional()
  paymentCode?: string;

  token?: string;

  @ApiPropertyOptional({
    example: '3d48b310-7e22-48ab-80af-a53989009de8',
    description: 'paymentToenProvide(unique)',
    required: false,
  })
  @IsString()
  @IsOptional()
  paymentTokenPrvider?: string;

  @ApiPropertyOptional({
    example: 'W_829224562256',
    description: "Code d'origine",
    required: false,
  })
  @IsString()
  @IsOptional()
  origin?: string;

  @ApiPropertyOptional({
    example: 'W_525615454544',
    description: 'Code cible',
    required: false,
  })
  @IsString()
  @IsOptional()
  target?: string;
}

export class UniqueCheckQueryDto {
  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsOptional()
  @IsString()
  promo_code?: string;

  @IsOptional()
  @IsString()
  commercial_code?: string;

  // utile en update pour ignorer la ligne courante
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  excludeId?: number;
}

export class UpdateProviderInfoDto {
  @IsOptional()
  @IsString()
  payment_token_provider: string;

  @IsOptional()
  @IsString()
  status_provider?: string;

  @IsOptional()
  @IsString()
  payment_code: string;

  phoneNumber: string;
  payToken: string;
  status?: number;

  @IsOptional()
  @IsNumber()
  commission?: number;
}
