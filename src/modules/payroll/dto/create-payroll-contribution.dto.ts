import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContributionBase, ContributionPayer } from '../entities/payroll-contribution.entity';

export class CreatePayrollContributionDto {
  @ApiProperty({ example: 'CNPS_PVID' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'CNPS - Pension vieillesse (part salariale)' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: 4.2, description: 'Pourcentage, ou montant si base = fixed' })
  @IsNumber()
  @Min(0)
  rate: number;

  @ApiPropertyOptional({ enum: ContributionBase, default: ContributionBase.GROSS })
  @IsEnum(ContributionBase)
  @IsOptional()
  base_type?: ContributionBase;

  @ApiProperty({ enum: ContributionPayer })
  @IsEnum(ContributionPayer)
  @IsNotEmpty()
  payer: ContributionPayer;

  @ApiPropertyOptional({ example: 750000, description: "Plafond mensuel de l'assiette" })
  @IsNumber()
  @IsOptional()
  ceiling?: number;

  @ApiPropertyOptional({ example: '431', description: 'Compte SYSCOHADA' })
  @IsString()
  @IsOptional()
  account_number?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 100 })
  @IsInt()
  @IsOptional()
  sort_order?: number;
}
