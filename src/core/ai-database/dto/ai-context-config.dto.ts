import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class AiAssistantSettingsDto {
  @IsBoolean() enabled: boolean;
}

export class AiContextSuggestionDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,80}$/) code: string;
  @IsString() @MinLength(1) @MaxLength(200) label: string;
  @IsString() @MinLength(1) @MaxLength(2000) prompt: string;
  @IsIn(['read', 'prepare', 'write']) intent: 'read' | 'prepare' | 'write';
  @IsOptional() @IsString() @MaxLength(100) permission?: string;
  @IsInt() @Min(0) sort_order: number;
  @IsBoolean() enabled: boolean;
}

export class AiContextConfigDto {
  @IsString() @Matches(/^(\*|[a-zA-Z0-9_-]{1,80})$/) resource_type: string;
  @IsIn(['*', 'page', 'resource', 'collection', 'selection', 'create', 'edit', 'complete', 'transition']) scope: string;
  @IsString() @Matches(/^(\*|[a-zA-Z0-9_-]{1,120})$/) operation_key: string;
  @IsString() @MinLength(1) @MaxLength(200) label: string;
  @IsOptional() @IsString() @MaxLength(4000) instructions?: string;
  @IsBoolean() enabled: boolean;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => AiContextSuggestionDto)
  suggestions: AiContextSuggestionDto[];
}
