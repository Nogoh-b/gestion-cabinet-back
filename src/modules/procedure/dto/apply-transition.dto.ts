import {
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class ApplyTransitionDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  userInputs?: Record<string, any>;
}
