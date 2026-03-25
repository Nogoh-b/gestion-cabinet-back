// dto/apply-transition.dto.ts
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class ApplyTransitionDto {
  @IsUUID()
  transitionId: string;

  @IsOptional()
  @IsString()
  comment: string;
}