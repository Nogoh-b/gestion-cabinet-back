// dto/create-procedure-template.dto.ts
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';

export class CreateSubStageDto {
  @IsString()
  name: string;

   @IsOptional()
  @IsString()
  id?: string;

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

export class CreateStageDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  canBeSkipped?: boolean;
@IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  canBeReentered?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubStageDto)
  subStages?: CreateSubStageDto[];
}

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
}

export class UpdateStageDto extends PartialType(CreateStageDto) {
  @IsOptional()
  @IsString()
  id?: string;
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
  @IsInt()
  order?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateStageDto)
  stages?: UpdateStageDto[];
}