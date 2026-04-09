// src/modules/audiences/dto/decision-audience.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsDateString } from 'class-validator';

export class DecisionAudienceDto {
  @ApiProperty({ description: 'Texte de la décision' })
  @IsString()
  decision: string;

  @ApiProperty({ description: 'Issue de la décision', required: false })
  @IsOptional()
  @IsString()
  outcome?: string; // 'favorable', 'unfavorable', 'partial'

  @ApiProperty({ description: 'IDs des documents liés à la décision', required: false, type: [Number] })
  @IsOptional()
  @IsArray()
  document_decision_ids?: number[];

  @ApiProperty({ description: 'Date de la décision', required: false })
  @IsOptional()
  @IsDateString()
  decision_date?: Date;

  @ApiProperty({ description: 'Observations sur la décision', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
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
  documents: any[];
}