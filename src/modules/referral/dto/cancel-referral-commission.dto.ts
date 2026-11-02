import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelReferralCommissionDto {
  @ApiProperty({ example: 'Commission annulée après rectification contractuelle' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
