// src/modules/customers/dto/customer-search.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, IsNumber, IsEnum } from "class-validator";
import { CustomerStatus, CustomerCreatedFrom } from "../entities/customer.entity";

export class CustomerSearchDto {

  // 🎯 Filtres spécifiques
  @ApiPropertyOptional({ example: "NOGOH", description: "Nom du client" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ example: "Lionel", description: "Prénom du client" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: "lionel.nogoh@cabinet.cm" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: "JUR-CLI-ABC123", description: "Code client unique" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  customer_code?: string;

  @ApiPropertyOptional({ example: "ABC SARL", description: "Nom de la société" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  company_name?: string;

  @ApiPropertyOptional({ example: "forfait", description: "Type de facturation" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  billing_type?: string;

  @ApiPropertyOptional({ example: "+237699000000", description: "Numéro de téléphone professionnel" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  professional_phone?: string;

  @ApiPropertyOptional({ example: "Douala", description: "Ville ou localisation" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  location_city?: string;

  @ApiPropertyOptional({ example: "SAS", description: "Forme juridique (SARL, SAS, etc.)" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  legal_form?: string;

  @ApiPropertyOptional({ example: "A12345", description: "SIRET ou RCCM" })
  @ApiProperty()
  @IsOptional()
  @IsString()
  siret?: string;

  @ApiPropertyOptional({ example: CustomerStatus.ACTIVE, enum: CustomerStatus })
  @ApiProperty()
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ example: 1, description: "Type de client (clé étrangère)" })
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  type_customer?: number;

  @ApiPropertyOptional({ example: 1, enum: CustomerCreatedFrom })
  @ApiProperty()
  @IsOptional()
  @IsEnum(CustomerCreatedFrom)
  created_from?: CustomerCreatedFrom;

  
}
