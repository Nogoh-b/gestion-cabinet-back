// create-referrer.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReferrerPaymentMethod, ReferrerType } from '../entities/referral.entity';

export class CreateReferrerDto {
  @ApiProperty({ example: 'Cabinet Dupont & Associés', description: 'Raison sociale ou nom complet' })
  @IsString()
  @IsNotEmpty()
  company_name: string;

  @ApiProperty({ enum: ReferrerType, example: ReferrerType.LAWYER })
  @IsEnum(ReferrerType)
  @IsNotEmpty()
  referrer_type: ReferrerType;

  @ApiPropertyOptional({ example: false, description: 'True si employé du cabinet' })
  @IsBoolean()
  @IsOptional()
  is_internal?: boolean;

  @ApiPropertyOptional({ example: 5, description: 'ID employé si interne' })
  @IsNumber()
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ example: 12, description: 'ID client si le client est apporteur' })
  @IsNumber()
  @IsOptional()
  customer_id?: number;

  @ApiPropertyOptional({ example: 'Jean Martin', description: 'Nom du contact' })
  @IsString()
  @IsOptional()
  contact_name?: string;

  @ApiPropertyOptional({ example: 'contact@cabinet-dupont.fr' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+33 1 23 45 67 89' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '15 rue de la Paix, 75001 Paris' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 10.0, description: 'Taux de commission par défaut (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  default_commission_rate?: number;

  @ApiPropertyOptional({ enum: ReferrerPaymentMethod, example: ReferrerPaymentMethod.VIREMENT })
  @IsEnum(ReferrerPaymentMethod)
  @IsOptional()
  payment_method?: ReferrerPaymentMethod;

  @ApiPropertyOptional({ example: 'BNP Paribas' })
  @IsString()
  @IsOptional()
  bank_name?: string;

  @ApiPropertyOptional({ example: 'Cabinet Dupont' })
  @IsString()
  @IsOptional()
  bank_account_holder?: string;

  @ApiPropertyOptional({ example: 'FR76 3000 4000 0100 0000 0000 000' })
  @IsString()
  @IsOptional()
  bank_iban?: string;

  @ApiPropertyOptional({ example: 'Apporteur fidèle depuis 2020' })
  @IsString()
  @IsOptional()
  notes?: string;
}