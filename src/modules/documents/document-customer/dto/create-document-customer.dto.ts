import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsBoolean, IsEnum, IsString, IsJSON } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DocumentCategory, DocumentCustomerStatus } from '../entities/document-customer.entity';


export class CreateDocumentCustomerDto {
  @ApiProperty({ description: 'ID du type de document' })
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  document_type_id: number;

  @ApiProperty({ description: 'ID du dossier' })
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  dossier_id: number;

  @ApiProperty({ description: 'ID du client' })
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  customer_id: number;

  @ApiPropertyOptional({ description: 'ID du prêt associé' })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => value ? parseInt(value) : undefined)
  loan_id?: number;

  @ApiPropertyOptional({ description: 'Description du document' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Nom du document' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ 
    enum: DocumentCategory,
    description: 'Catégorie du document' 
  })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiPropertyOptional({ 
    enum: DocumentCustomerStatus,
    description: 'Statut du document' 
  })
  @IsOptional()
  @IsEnum(DocumentCustomerStatus)
  status?: DocumentCustomerStatus;

  @ApiPropertyOptional({ description: 'Document requis pour une audience' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  required_for_hearing?: boolean;

  @ApiPropertyOptional({ description: 'Document confidentiel' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_confidential?: boolean;

  @ApiPropertyOptional({ description: 'Métadonnées du document' })
  @IsOptional()
  @IsJSON()
  metadata?: string;

  @ApiPropertyOptional({ description: 'Mode strict (lève des exceptions)' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  strict?: boolean = true;

  @ApiProperty({ type: 'string', format: 'binary', description: 'Fichier à uploader' })
  file: Express.Multer.File;
}