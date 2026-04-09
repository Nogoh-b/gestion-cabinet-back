import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsString, Max, Min } from "class-validator";
import { DangerLevel } from "../entities/dossier.entity";

// src/modules/dossiers/dto/preliminary-analysis.dto.ts
export class PreliminaryAnalysisDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  successProbability: number;

  @IsEnum(DangerLevel)
  danger_level: DangerLevel;

  @IsString()
  notes: string;
}

// src/modules/dossiers/dto/client-decision.dto.ts
export class ClientDecisionDto {
  @IsString()
  @IsIn(['transaction', 'contentieux', 'abandon'])
  decision: string;
}

// src/modules/dossiers/dto/judgment.dto.ts
export class JudgmentDto {
  @IsString()
  decision: string;

  @IsInt()
  idAudience: number;

  @IsBoolean()
  isSatisfied: boolean;
}