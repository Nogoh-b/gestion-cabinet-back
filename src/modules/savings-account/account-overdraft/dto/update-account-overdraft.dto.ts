import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAccountOverdraftDto {
  @ApiPropertyOptional({ example: -50000, description: 'Nouveau plafond de découvert' })
  @IsOptional()
  @IsNumber()
  overdraft_limit?: number;

  @ApiPropertyOptional({ example: 'Réduction du découvert suite à incident' })
  @IsOptional()
  @IsString()
  reason?: string;
}
