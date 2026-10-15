import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Multipart fields describe a draft only; this endpoint never executes a write. */
export class PrepareFormDto {
  @IsString()
  @MaxLength(12000)
  text: string = '';

  @IsString()
  @MaxLength(80000)
  fields: string = '[]';

  @IsOptional()
  @IsString()
  @MaxLength(80000)
  currentValues?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80000)
  context?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(['create', 'edit', 'complete', 'transition'])
  mode?: 'create' | 'edit' | 'complete' | 'transition';

  @IsOptional() @IsString() @MaxLength(80)
  resourceType?: string;

  @IsOptional() @IsString() @MaxLength(120)
  operationKey?: string;

  @IsOptional()
  @IsIn(['prepare', 'read'])
  intent?: 'prepare' | 'read';

  @IsOptional() @IsString() @MaxLength(100)
  timeZone?: string;
}
