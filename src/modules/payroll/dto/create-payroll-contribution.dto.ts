import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ContributionBase,
  ContributionPayer,
} from '../entities/payroll-contribution.entity';

export class CreatePayrollContributionDto {
  @ApiProperty({ example: 'CNPS_PVID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  code: string;

  @ApiProperty({
    example: 'CNPS - Pension vieillesse (part salariale)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  label: string;

  @ApiProperty({
    example: 4.2,
    description: 'Pourcentage, ou montant si la base est fixe',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  rate: number;

  @ApiPropertyOptional({
    enum: ContributionBase,
    default: ContributionBase.GROSS,
  })
  @IsEnum(ContributionBase)
  @IsOptional()
  base_type?: ContributionBase;

  @ApiProperty({ enum: ContributionPayer })
  @IsEnum(ContributionPayer)
  payer: ContributionPayer;

  @ApiPropertyOptional({ example: 750000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  ceiling?: number;

  @ApiPropertyOptional({ example: '431' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  account_number?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sort_order?: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  valid_from: string;
}
