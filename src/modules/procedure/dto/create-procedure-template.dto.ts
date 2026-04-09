// dto/create-procedure-template.dto.ts
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsObject, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

// DTO pour les sous-stages
export class CreateSubStageDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

// DTO pour les stages
export class CreateStageDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  canBeSkipped?: boolean;

  @IsOptional()
  @IsBoolean()
  canBeReentered?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubStageDto)
  subStages?: CreateSubStageDto[];
}

// DTO pour la configuration des stages
export class StageConfigDto {
  @IsOptional()
  @IsBoolean()
  allowDocuments?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDiligences?: boolean;

  @IsOptional()
  @IsBoolean()
  allowInvoices?: boolean;

  @IsOptional()
  @IsBoolean()
  allowHearings?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentTypesAllowed?: string[];

  @IsOptional()
  @IsObject()
  diligenceConfig?: any;

  @IsOptional()
  @IsObject()
  hearingConfig?: any;

  @IsOptional()
  @IsObject()
  invoiceConfig?: any;
}

// DTO pour les transitions
export class CreateTransitionDto {
  @IsString()
  fromStageId: string;

  @IsString()
  toStageId: string;

  @IsString()
  type: 'AUTOMATIC' | 'MANUAL';

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsObject()
  condition?: any;

  @IsOptional()
  @IsString()
  triggerEvent?: string;

  @IsOptional()
  @IsObject()
  triggerCondition?: any;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDecision?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresValidation?: boolean;

  @IsOptional()
  @IsObject()
  onTransition?: any;
}

// DTO pour les cycles
export class CreateCycleDto {
  @IsString()
  fromStageId: string;

  @IsString()
  toStageId: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsObject()
  condition?: any;

  @IsOptional()
  @IsNumber()
  maxLoops?: number;
}

// DTO principal pour la création
export class CreateProcedureTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStageDto)
  stages: CreateStageDto[];

  // AJOUT : Configurations des stages
  @IsOptional()
  @IsObject()
  stageConfigs?: Record<string, StageConfigDto>;

  // AJOUT : Transitions
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransitionDto)
  transitions?: CreateTransitionDto[];

  // AJOUT : Cycles
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCycleDto)
  cycles?: CreateCycleDto[];
}