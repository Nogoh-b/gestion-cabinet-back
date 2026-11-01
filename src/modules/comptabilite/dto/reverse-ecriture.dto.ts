import { IsString, MinLength } from 'class-validator';

export class ReverseEcritureDto {
  @IsString()
  @MinLength(10)
  raison: string;
}
