import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt } from 'class-validator';
export enum CommissionValueType {
  FIXED = 0,
  VARIABLE = 1,
}
export class CreateCommissionDto {
  @ApiProperty({ description: 'Commission description', example: 'Processing fee' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Commission value type', enum: CommissionValueType })
  @IsEnum(CommissionValueType)
  valueType: CommissionValueType;

  @ApiPropertyOptional({ description: 'Fixed amount or percentage', example: 100 })
  @IsInt()
  @IsOptional()
  amount?: number;
}
