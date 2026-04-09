// dto/apply-transition.dto.ts
import { IsString, IsOptional, IsObject, IsArray, IsUUID } from 'class-validator';

export class ApplyTransitionDto {
  @IsUUID()
  transitionId: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  userInputs?: Record<string, any>;

  @IsOptional()
  @IsArray()
  fileIds?: number[]; // IDs des fichiers déjà uploadés
}