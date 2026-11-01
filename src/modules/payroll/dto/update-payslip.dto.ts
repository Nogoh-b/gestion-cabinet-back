import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePayslipDto {
  @ApiPropertyOptional({ example: 450000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  gross_amount?: number;

  @ApiPropertyOptional({ example: 350000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  net_amount?: number;

  @ApiPropertyOptional({ example: 'Régularisation contractuelle' })
  @IsString()
  @IsOptional()
  notes?: string;
}
