import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelSalaryAdvanceDto {
  @ApiProperty({ example: 'Demande retirée par le collaborateur' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
