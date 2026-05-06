import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsInt,
    IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierCategory } from '../entities/supplier.entity';

export class CreateSupplierDto {
  @ApiProperty({
    example: 'Orange Business Services',
    description: 'Raison sociale du fournisseur',
  })
  @IsString()
  @IsNotEmpty()
  company_name: string;

  @ApiProperty({
    enum: SupplierCategory,
    example: SupplierCategory.INTERNET,
    description: 'Catégorie du fournisseur',
  })
  @IsEnum(SupplierCategory)
  @IsNotEmpty()
  category: SupplierCategory;

  @ApiPropertyOptional({
    example: 'Jean Dupont',
    description: 'Nom du contact',
  })
  @IsString()
  @IsOptional()
  contact_name?: string;

  @ApiPropertyOptional({
    example: 'contact@orange.fr',
    description: 'Email du contact',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: '+33 1 23 45 67 89',
    description: 'Téléphone',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: '15 rue de la Paix, 75001 Paris',
    description: 'Adresse postale',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    example: 'FR12345678901',
    description: 'Numéro de TVA intracommunautaire',
  })
  @IsString()
  @IsOptional()
  tva_number?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID de l\'agence concernée',
  })
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Actif',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  status?: boolean;
}