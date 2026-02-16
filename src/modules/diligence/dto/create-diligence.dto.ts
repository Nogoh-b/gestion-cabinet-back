// src/modules/diligences/dto/create-diligence.dto.ts
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsInt,
    IsDateString,
    IsEnum,
    IsNumber,
    Min
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiligenceType, DiligencePriority } from '../entities/diligence.entity';

export class CreateDiligenceDto {
  @ApiProperty({
    example: 'Due Diligence acquisition Société ABC',
    description: "Titre de la mission de diligence",
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example: 'Audit complet dans le cadre de l\'acquisition de la société ABC',
    description: "Description détaillée de la mission",
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 15,
    description: "Identifiant du dossier concerné",
  })
  @IsInt()
  @IsNotEmpty()
  dossier_id: number;

  @ApiProperty({
    example: 42,
    description: "Identifiant de l'avocat assigné",
  })
  @IsInt()
  @IsOptional()
  assigned_lawyer_id?: number;

  @ApiProperty({
    enum: DiligenceType,
    example: DiligenceType.ACQUISITION,
    description: "Type de diligence",
  })
  @IsEnum(DiligenceType)
  @IsNotEmpty()
  type: DiligenceType;

  @ApiProperty({
    enum: DiligencePriority,
    example: DiligencePriority.HIGH,
    description: "Priorité de la mission",
  })
  @IsEnum(DiligencePriority)
  @IsOptional()
  priority?: DiligencePriority;

  @ApiProperty({
    example: '2026-03-01',
    description: "Date de début de la mission",
  })
  @IsDateString()
  @IsNotEmpty()
  start_date: Date;

  @ApiProperty({
    example: '2026-04-15',
    description: "Date limite de remise du rapport",
  })
  @IsDateString()
  @IsNotEmpty()
  deadline: Date;

  @ApiPropertyOptional({
    example: 50,
    description: "Budget en heures",
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  budget_hours?: number;

  @ApiPropertyOptional({
    example: 'Périmètre de l\'audiet : contrats, propriété intellectuelle, litiges...',
    description: "Périmètre détaillé de la diligence",
  })
  @IsString()
  @IsOptional()
  scope?: string;

  @ApiPropertyOptional({
    example: 'REF-2026-001',
    description: "Référence client pour la mission",
  })
  @IsString()
  @IsOptional()
  client_reference?: string;
}