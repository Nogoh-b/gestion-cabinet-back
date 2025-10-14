// create-customer.dto.ts
import { Type } from 'class-transformer';
import {
  IsString,
  IsInt,
  IsEmail,
  IsDate,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsEnum
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CustomerCreatedFrom, CustomerStatus } from '../entities/customer.entity';


export class CreateCustomerDto {
  @IsString()
  @MaxLength(45)
  @IsNotEmpty()
  @ApiProperty({ example: 'John', description: 'Customer first name' })
  first_name: string;

  @IsString()
  @MaxLength(45)
  @IsNotEmpty()
  @ApiProperty({ example: 'Doe', description: 'Customer last name' })
  last_name: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  @ApiPropertyOptional({ example: 'Entreprise SARL', description: 'Company name' })
  company_name?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ example: '123 Rue de la République', description: 'Complete address' })
  address?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  @ApiPropertyOptional({ example: '75001', description: 'Postal code' })
  postal_code?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 'France', description: 'Country', default: 'France' })
  country?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  @ApiPropertyOptional({ 
    example: 'forfait', 
    description: 'Billing type: forfait, temps_passe, mixte' 
  })
  billing_type?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+33123456789', description: 'Professional phone number' })
  professional_phone?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+33123456780', description: 'Fax number' })
  fax?: string;

  @IsString()
  @MaxLength(14)
  @IsOptional()
  @ApiPropertyOptional({ example: '12345678901234', description: 'SIRET number' })
  siret?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  @ApiPropertyOptional({ example: 'FR12345678901', description: 'TVA number' })
  tva_number?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 'SARL', description: 'Legal form: SARL, SAS, EI, etc.' })
  legal_form?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  @ApiPropertyOptional({ example: 'Recommandation', description: 'How the client found us' })
  reference?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+216 55 55 55 55', description: 'Primary phone number' })
  number_phone_1?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: '+216 55 55 55 56', description: 'Secondary phone number' })
  number_phone_2?: string;

  @IsEmail()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ example: 'john.doe@gmail.com', description: 'Email address' })
  email?: string;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'Branch identifier' })
  branch_id: number;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'Location city identifier' })
  location_city_id: number;

  @IsInt()
  @IsNotEmpty()
  @ApiProperty({ example: 1, description: 'Customer type identifier' })
  type_customer_id: number;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ 
    example: '00000000000000000',
    description: 'National Unique Identifier' 
  })
  nui?: string;

  @IsString()
  @MaxLength(45)
  @IsOptional()
  @ApiPropertyOptional({ 
    example: '00000000000000000',
    description: 'RCCM number' 
  })
  rccm?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  @ApiPropertyOptional({ example: '1990-01-01', description: 'Birth date' })
  birthday?: Date;

  @IsEnum(CustomerCreatedFrom)
  @IsOptional()
  @ApiPropertyOptional({ 
    enum: CustomerCreatedFrom,
    example: CustomerCreatedFrom.AGENCY,
    description: 'How the customer was created' 
  })
  created_from?: CustomerCreatedFrom;

  @IsEnum(CustomerStatus)
  @IsOptional()
  @ApiPropertyOptional({ 
    enum: CustomerStatus,
    example: CustomerStatus.ACTIVE,
    description: 'Customer status' 
  })
  status?: CustomerStatus;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Customer code (auto-generated if not provided)' })
  customer_code?: string;

  // Note: public_key and private_key are auto-generated and should not be in DTO
}