import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsString,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayslipStatus } from '../entities/payslip.entity';

export class CreatePayslipDto {
  @ApiProperty({
    example: 5,
    description: 'ID du collaborateur',
  })
  @IsInt()
  @IsNotEmpty()
  employee_id: number;

  @ApiProperty({
    example: 3,
    description: 'ID de la période de paie',
  })
  @IsInt()
  @IsNotEmpty()
  period_id: number;

  @ApiProperty({
    example: 4500.0,
    description: 'Salaire de base. Le back génère les cotisations et calcule le brut/net.',
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  gross_amount: number;

  @ApiPropertyOptional({
    example: 3200.0,
    description: 'Net à payer (optionnel — calculé automatiquement à partir des lignes/cotisations)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  net_amount?: number;

  @ApiPropertyOptional({
    enum: PayslipStatus,
    example: PayslipStatus.DRAFT,
    description: "Statut souhaité. 'validated'/'paid' déclenchent le cycle de vie (validation, comptabilisation).",
  })
  @IsEnum(PayslipStatus)
  @IsOptional()
  status?: PayslipStatus;

  @ApiPropertyOptional({
    example: 'Fiche générée automatiquement',
    description: 'Notes internes',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}