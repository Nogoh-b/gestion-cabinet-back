// src/modules/audiences/dto/decision-audience.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AudienceRecordStatus } from '../entities/audience.entity';

export class DecisionAudienceDto {
  @ApiProperty({ description: 'Texte de la décision', required: false })
  @IsOptional()
  @IsString()
  decision?: string;

  @ApiProperty({ description: 'Issue de la décision', required: false })
  @IsOptional()
  @IsString()
  outcome?: string; // 'favorable', 'unfavorable', 'partial'

  @ApiProperty({ description: 'IDs des documents liés à la décision', required: false, type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  document_decision_ids?: number[];

  @ApiProperty({ description: 'Date de la décision', required: false })
  @IsOptional()
  @IsDateString()
  decision_date?: Date;

  @ApiProperty({ description: 'Observations sur la décision', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  // Alias accepté par le formulaire front (champ `decision_notes`).
  @ApiProperty({ description: 'Observations sur la décision (alias)', required: false })
  @IsOptional()
  @IsString()
  decision_notes?: string;

  @ApiProperty({
    description: 'Motif obligatoire pour amender une décision scellée',
    required: false,
    minLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  amendment_reason?: string;
}

export class AddDecisionResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  decision: string;

  @ApiProperty()
  outcome: string;

  @ApiProperty()
  decision_date: Date;

  @ApiProperty()
  documents: Array<{
    id: number;
    name: string;
    current_version_id: string | null;
  }>;

  @ApiProperty({ enum: AudienceRecordStatus })
  record_status: AudienceRecordStatus;

  @ApiProperty()
  record_version: number;

  @ApiProperty({ nullable: true })
  record_hash: string | null;

  @ApiProperty({ nullable: true })
  sealed_at: Date | null;
}
