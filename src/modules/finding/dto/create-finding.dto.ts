// src/modules/findings/dto/create-finding.dto.ts
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsInt,
    IsEnum,
    IsNumber,
    IsDateString,
    IsBoolean
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FindingSeverity, FindingCategory } from '../entities/finding.entity';

export class CreateFindingDto {
  @ApiProperty({
    example: 'Clause de non-concurrence trop large',
    description: "Titre de l'anomalie/risque",
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'La clause de non-concurrence s\'étend sur 5 ans et sur tout le territoire national...',
    description: "Description détaillée",
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 5,
    description: "ID de la diligence concernée",
  })
  @IsInt()
  @IsNotEmpty()
  diligence_id: number;

  @ApiPropertyOptional({
    example: 12,
    description: "ID du document concerné (optionnel)",
  })
  @IsInt()
  @IsOptional()
  document_id?: number;

  @ApiProperty({
    enum: FindingSeverity,
    example: FindingSeverity.HIGH,
    description: "Sévérité du risque",
  })
  @IsEnum(FindingSeverity)
  @IsNotEmpty()
  severity: FindingSeverity;

  @ApiProperty({
    enum: FindingCategory,
    example: FindingCategory.CONTRACT,
    description: "Catégorie juridique",
  })
  @IsEnum(FindingCategory)
  @IsNotEmpty()
  category: FindingCategory;

  @ApiPropertyOptional({
    example: 42,
    description: "ID de l'avocat qui a créé le finding",
  })
  @IsInt()
  @IsOptional()
  created_by_id?: number;

  @ApiPropertyOptional({
    example: 'Cette clause pourrait empêcher l\'acquisition car elle limite trop la liberté du dirigeant',
    description: "Impact potentiel sur l'opération",
  })
  @IsString()
  @IsOptional()
  impact?: string;

  @ApiPropertyOptional({
    example: 'Négocier une réduction à 2 ans et un périmètre géographique limité',
    description: "Recommandation",
  })
  @IsString()
  @IsOptional()
  recommendation?: string;

  @ApiPropertyOptional({
    example: 'Article L. 1234-5 du Code du travail...',
    description: "Base légale / jurisprudence",
  })
  @IsString()
  @IsOptional()
  legal_basis?: string;

  @ApiPropertyOptional({
    example: 150000,
    description: "Montant estimé du risque (en euros)",
  })
  @IsNumber()
  @IsOptional()
  estimated_risk_amount?: number;

  @ApiPropertyOptional({
    example: '2026-04-01',
    description: "Date butoir pour la résolution",
  })
  @IsDateString()
  @IsOptional()
  due_date?: Date;

  @ApiPropertyOptional({
    example: true,
    description: "Confidentiel",
  })
  @IsBoolean()
  @IsOptional()
  confidential?: boolean;
}