import { PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LegalDeadlineDurationUnit,
  LegalNotificationMethod,
} from '../entities/legal-deadline-rule.entity';

export class CreateLegalDeadlineRuleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  family_key?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  jurisdiction_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  procedure_type_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  decision_outcome?: string;

  @IsEnum(LegalNotificationMethod)
  notification_method: LegalNotificationMethod;

  @IsInt()
  @Min(1)
  @Max(3650)
  duration_value: number;

  @IsEnum(LegalDeadlineDurationUnit)
  duration_unit: LegalDeadlineDurationUnit;

  @IsOptional()
  @IsBoolean()
  include_start_day?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  expiry_event?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(3650, { each: true })
  warning_offsets?: number[];

  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsDateString()
  effective_from?: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;
}

export class UpdateLegalDeadlineRuleDto extends PartialType(
  CreateLegalDeadlineRuleDto,
) {}

export class RecordLegalNotificationDto {
  @IsInt()
  @Min(1)
  audience_id: number;

  @IsDateString()
  notified_at_utc: string;

  @IsEnum(LegalNotificationMethod)
  notification_method: LegalNotificationMethod;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  notification_reference?: string;
}

export class CloseLegalDeadlineDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}
