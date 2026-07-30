// close-dossier.dto.ts
import {
  IsEnum,
  IsOptional,
  IsNumber,
  IsString,
  IsDateString,
  Min,
  IsBoolean,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientSatisfaction, DossierOutcome } from '../entities/dossier.entity';




export class CloseDossierDto {
  @IsEnum(DossierOutcome)
  outcome: DossierOutcome;

  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  outcome_date?: Date;

  @IsString()
  @IsNotEmpty()
  outcome_notes: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  damages_awarded?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costs_awarded?: number;

  @IsOptional()
  @IsString()
  final_decision_text?: string;

  @ValidateIf(o => o.outcome === DossierOutcome.SETTLED)
  @IsNumber()
  @Min(0)
  @IsOptional()
  settlement_amount?: number;

  @ValidateIf(o => o.outcome === DossierOutcome.SETTLED)
  @IsString()
  @IsOptional()
  settlement_terms?: string;

  @IsOptional()
  @IsEnum(ClientSatisfaction)
  client_satisfaction?: ClientSatisfaction;

  @IsOptional()
  @IsBoolean()
  send_report_to_client?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ValidateIf((dto) => dto.force === true)
  @IsString()
  @IsNotEmpty()
  override_reason?: string;
}
