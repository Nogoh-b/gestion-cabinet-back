// dto/create-procedure-instance.dto.ts
import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateProcedureInstanceDto {
  @IsString()
  templateId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}