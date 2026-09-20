import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  MinLength,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DossierOutcome,
  ClientSatisfaction,
} from 'src/modules/dossiers/entities/dossier.entity';
import {
  ActionBillingDecision,
  ActionLinkRole,
  ActionPriority,
  BillableSourceType,
  BillingCalculationMode,
  BillingMode,
  BillingTrigger,
  RecommendationTrigger,
} from '../case-workflow.enums';

export class ActionResultDefinitionDto {
  @IsString()
  @MaxLength(100)
  code: string;

  @IsString()
  @MaxLength(200)
  label: string;
}

export class CreateActionFamilyDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(160)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateActionFamilyDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateActionDefinitionDto {
  @IsUUID()
  family_id: string;

  @IsString()
  @MaxLength(100)
  code: string;

  @IsString()
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsObject()
  specific_fields_schema?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResultDefinitionDto)
  allowed_results?: ActionResultDefinitionDto[];

  @IsOptional()
  @IsObject()
  required_relations?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  default_due_days?: number;

  @IsOptional()
  @IsEnum(ActionPriority)
  default_priority?: ActionPriority;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @IsOptional()
  @IsBoolean()
  billable_by_default?: boolean;

  @IsOptional()
  @IsEnum(BillingCalculationMode)
  billing_mode?: BillingCalculationMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_rate?: number;
}

export class ReviseActionDefinitionDto {
  @IsOptional()
  @IsUUID()
  family_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsObject()
  specific_fields_schema?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResultDefinitionDto)
  allowed_results?: ActionResultDefinitionDto[];

  @IsOptional()
  @IsObject()
  required_relations?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  default_due_days?: number;

  @IsOptional()
  @IsEnum(ActionPriority)
  default_priority?: ActionPriority;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @IsOptional()
  @IsBoolean()
  billable_by_default?: boolean;

  @IsOptional()
  @IsEnum(BillingCalculationMode)
  billing_mode?: BillingCalculationMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  default_rate?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ActionResourceLinkDto {
  @IsInt()
  @IsPositive()
  id: number;

  @IsEnum(ActionLinkRole)
  role: ActionLinkRole;
}

export class ActionDependencyDto {
  @IsUUID()
  id: string;

  @IsEnum(ActionLinkRole)
  role: ActionLinkRole = ActionLinkRole.DEPENDS_ON;
}

export class CreateDossierActionDto {
  @IsUUID()
  definition_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsInt()
  responsible_user_id?: number;

  @IsOptional()
  @IsEnum(ActionPriority)
  priority?: ActionPriority;

  @IsOptional()
  @IsDateString()
  planned_at?: string;

  @IsOptional()
  @IsDateString()
  due_at?: string;

  @IsOptional()
  @IsDateString()
  remind_at?: string;

  @IsOptional()
  @IsObject()
  specific_data?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResourceLinkDto)
  documents?: ActionResourceLinkDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResourceLinkDto)
  audiences?: ActionResourceLinkDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDependencyDto)
  previous_actions?: ActionDependencyDto[];

  @IsOptional()
  @IsUUID()
  source_recommendation_id?: string;

  @IsOptional()
  @IsBoolean()
  start_immediately?: boolean;
}

export class UpdateDossierActionDetailsDto {
  @IsInt()
  @Min(1)
  expected_version: number;

  @IsOptional()
  @IsObject()
  specific_data?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResourceLinkDto)
  documents?: ActionResourceLinkDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResourceLinkDto)
  audiences?: ActionResourceLinkDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionDependencyDto)
  previous_actions?: ActionDependencyDto[];
}

export class CreateRecommendationRuleDto {
  @IsString()
  @MaxLength(100)
  code: string;

  @IsString()
  @MaxLength(200)
  label: string;

  @IsEnum(RecommendationTrigger)
  trigger: RecommendationTrigger;

  @IsObject()
  condition_json: Record<string, unknown>;

  @IsUUID()
  action_definition_id: string;

  @IsString()
  @MaxLength(2000)
  reason_template: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  specificity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  due_offset_days?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ReviseRecommendationRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsEnum(RecommendationTrigger)
  trigger?: RecommendationTrigger;

  @IsOptional()
  @IsObject()
  condition_json?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  action_definition_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason_template?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  specificity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  due_offset_days?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class ActionTransitionDto {
  @IsInt()
  @Min(1)
  expected_version: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ExtendDossierActionDeadlineDto {
  @IsDateString()
  due_at: string;

  @IsOptional()
  @IsDateString()
  remind_at?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class CompleteDossierActionDto extends ActionTransitionDto {
  @IsString()
  @MaxLength(100)
  result_code: string;

  @IsOptional()
  @IsString()
  result_notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration_minutes?: number;

  @IsOptional()
  @IsObject()
  specific_data?: Record<string, unknown>;

  @IsEnum(ActionBillingDecision)
  billing_decision: ActionBillingDecision;

  @IsOptional()
  @IsString()
  billing_reason?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResourceLinkDto)
  documents?: ActionResourceLinkDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionResourceLinkDto)
  audiences?: ActionResourceLinkDto[];
}

export class DeferRecommendationDto {
  @IsDateString()
  remind_at: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class UpdateBillingProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vat_rate?: number;

  @IsOptional()
  @IsEnum(BillingMode)
  mode?: BillingMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixed_fee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourly_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percentage_base?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  opening_fee?: number;

  @IsOptional()
  @IsBoolean()
  is_confirmed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  expected_version?: number;
}

export class GenerateInvoiceFromItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  billable_item_ids: string[];

  @IsOptional()
  @IsDateString()
  invoice_date?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;
}

export class ReviewBillableItemDto {
  @IsNumber()
  @IsPositive()
  unit_price: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_rate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class CreateDossierBillingRuleDto {
  @IsString()
  @MaxLength(100)
  code: string;

  @IsEnum(BillingTrigger)
  trigger: BillingTrigger;

  @IsEnum(BillingCalculationMode)
  calculation_mode: BillingCalculationMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  base_field?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action_definition_code?: string;

  @IsString()
  @MaxLength(120)
  fee_type: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ReviseDossierBillingRuleDto {
  @IsOptional()
  @IsEnum(BillingTrigger)
  trigger?: BillingTrigger;

  @IsOptional()
  @IsEnum(BillingCalculationMode)
  calculation_mode?: BillingCalculationMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  base_field?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action_definition_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fee_type?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class CreateManualBillableItemDto {
  @IsString()
  @MaxLength(255)
  label: string;

  @IsOptional()
  @IsEnum(BillableSourceType)
  source_type?: BillableSourceType;

  @IsOptional()
  @IsDateString()
  occurred_at?: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_rate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class WaiveBillableItemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class AdjustBillableItemDto {
  @IsNumber()
  amount_delta: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_rate?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @IsInt()
  @Min(1)
  expected_version: number;
}

export class CloseDossierV2Dto {
  @IsEnum(DossierOutcome)
  outcome: DossierOutcome;

  @IsOptional()
  @IsString()
  outcome_notes?: string;

  @IsOptional()
  @IsString()
  final_decision_text?: string;

  @IsOptional()
  @IsEnum(ClientSatisfaction)
  client_satisfaction?: ClientSatisfaction;

  @IsOptional()
  @IsString()
  justification?: string;

  @IsOptional()
  @IsArray()
  resolutions?: Array<Record<string, unknown>>;
}

export class ReopenDossierDto {
  @IsString()
  @MaxLength(2000)
  reason: string;
}

export class ApplyWorkflowMigrationDto {
  @IsUUID()
  migration_run_id: string;
}

export class UpdateCaseWorkflowFeatureDto {
  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  default_for_new_dossiers: boolean;
}

export class CreateLegacyWorkflowMappingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  match_pattern: string;

  @IsIn(['CONTAINS', 'EXACT'])
  match_mode: 'CONTAINS' | 'EXACT';

  @IsString()
  @MaxLength(100)
  action_definition_code: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ReviseLegacyWorkflowMappingDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  match_pattern?: string;

  @IsOptional()
  @IsIn(['CONTAINS', 'EXACT'])
  match_mode?: 'CONTAINS' | 'EXACT';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action_definition_code?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsInt()
  @Min(1)
  expected_version: number;
}
