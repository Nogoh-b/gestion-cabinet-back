// src/core/document/dto/create-document-type.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateDocumentTypeDto {
  @IsString()
  @ApiProperty({
    example: '0001',
    description: 'Code de type de document',
    required: true,
  })
  @IsNotEmpty()
  code: string;

  @IsString()
  @ApiProperty({
    example: 'CNI AVANT',
    description: 'Nom de type de document',
  })
  @IsNotEmpty()
  @ApiProperty({ example: 'Document type', required: true })
  name: string;

  @IsString()
  @ApiProperty({
    example: 'Document type description',
    description: 'Description de type de document',
  })
  @IsOptional()
  description?: string;

  @IsString()
  @ApiProperty({
    example: 1,
    description: 'Ty pe de client',
  })
  // @IsOptional()
  // type_customer_id?: number;

  @IsNumber()
  @ApiProperty({
    example: 1,
    description: 'Durée de validité du document',
    required: false,
  })
  @IsOptional()
  validityDuration?: number;

  @ApiProperty({
    example: true,
    description: 'Indique si le document est obligatoire',
  })
  @IsOptional()
  isRequired?: boolean;
}
