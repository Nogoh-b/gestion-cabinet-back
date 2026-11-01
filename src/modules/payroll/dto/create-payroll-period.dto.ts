import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsInt,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayrollPeriodDto {
  @ApiProperty({ example: 'Paie Mars 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  @IsNotEmpty()
  start_date: Date;

  @ApiProperty({ example: '2026-03-31' })
  @IsDateString()
  @IsNotEmpty()
  end_date: Date;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  branch_id?: number;
}
