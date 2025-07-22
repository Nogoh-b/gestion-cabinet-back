import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInterestSavingAccountDto {
  @ApiProperty({ description: 'Duration of the plan in months', example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration_months: number;

  @ApiProperty({ description: 'Interest rate (%)', example: 3.50 })
  @IsNumber()
  rate: number;
}
