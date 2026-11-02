import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayslipDto {
  @ApiProperty({ example: 5, description: 'ID du collaborateur' })
  @IsInt()
  @IsNotEmpty()
  employee_id: number;

  @ApiProperty({ example: 3, description: 'ID de la période de paie' })
  @IsInt()
  @IsNotEmpty()
  period_id: number;

  @ApiProperty({
    example: 450000,
    description:
      'Salaire de base. Le backend génère les cotisations et calcule le brut/net.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsNotEmpty()
  gross_amount: number;

  @ApiPropertyOptional({
    example: 320000,
    description:
      'Net provisoire, recalculé automatiquement à partir des lignes.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  net_amount?: number;

  @ApiPropertyOptional({ example: 'Fiche préparée manuellement' })
  @IsString()
  @IsOptional()
  notes?: string;
}
