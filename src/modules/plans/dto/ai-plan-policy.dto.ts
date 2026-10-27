import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AiPlanChoiceDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{2,80}$/i)
  provider_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Matches(/^[^\r\n\0]+$/)
  model: string;
}

export class AiPlanPolicyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AiPlanChoiceDto)
  default_model: AiPlanChoiceDto | null;

  @IsBoolean()
  allow_model_selection: boolean;

  @IsBoolean()
  allow_custom_providers: boolean;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AiPlanChoiceDto)
  allowed_models: AiPlanChoiceDto[];
}
