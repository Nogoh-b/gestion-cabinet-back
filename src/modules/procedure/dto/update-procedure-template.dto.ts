// dto/update-procedure-template.dto.ts
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';







export class UpdateSubStageDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsInt()
  order?: number;
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

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
  @Type(() => UpdateSubStageDto)
  subStages?: UpdateSubStageDto[];
}

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
}