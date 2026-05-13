import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEnum,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollPeriodStatus } from '../entities/payroll-period.entity';

export class CreatePayrollPeriodDto {
  @ApiProperty({
    example: 'Paie Mars 2026',
    description: 'Libellé de la période de paie',
  })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({
    example: '2026-03-01',
    description: 'Date de début de la période',
  })
  @IsDateString()
  @IsNotEmpty()
  start_date: Date;

  @ApiProperty({
    example: '2026-03-31',
    description: 'Date de fin de la période',
  })
  @IsDateString()
  @IsNotEmpty()
  end_date: Date;

  @ApiPropertyOptional({
    enum: PayrollPeriodStatus,
    example: PayrollPeriodStatus.DRAFT,
    description: 'Statut initial',
  })
  @IsEnum(PayrollPeriodStatus)
  @IsOptional()
  status?: PayrollPeriodStatus;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID de l\'agence concernée',
  })
  @IsInt()
  @IsOptional()
  branch_id?: number;
}