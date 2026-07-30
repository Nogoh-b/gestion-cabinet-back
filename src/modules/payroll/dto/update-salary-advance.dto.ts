import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSalaryAdvanceDto {
  @ApiPropertyOptional({ example: 150000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsDateString()
  @IsOptional()
  date_granted?: string;

  @ApiPropertyOptional({ example: 'Motif actualisé' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reason?: string;
}
