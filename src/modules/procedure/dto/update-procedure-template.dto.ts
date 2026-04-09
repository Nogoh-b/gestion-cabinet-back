// dto/update-procedure-template.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import {
    CreateStageDto,
    StageConfigDto,
    CreateTransitionDto,
    CreateCycleDto
} from './create-procedure-template.dto';
import { IsOptional, IsArray, ValidateNested, IsBoolean, IsString, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

// DTO pour la mise à jour des stages (avec ID optionnel)
export class UpdateStageDto extends PartialType(CreateStageDto) {
  @IsOptional()
  @IsString()
  id?: string;
}

// DTO pour la mise à jour
export class UpdateProcedureTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateStageDto)
  stages?: UpdateStageDto[];

  @IsOptional()
  @IsObject()
  stageConfigs?: Record<string, StageConfigDto>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransitionDto)
  transitions?: CreateTransitionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCycleDto)
  cycles?: CreateCycleDto[];
}