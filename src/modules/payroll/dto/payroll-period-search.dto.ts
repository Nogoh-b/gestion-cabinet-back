import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollPeriodStatus } from '../entities/payroll-period.entity';

export class PayrollPeriodSearchDto {
  @ApiPropertyOptional({ description: 'Recherche par libellé' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PayrollPeriodStatus, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;

  @ApiPropertyOptional({ description: 'Date début minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date début maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_date_to?: Date;

  @ApiPropertyOptional({ description: 'ID agence' })
  @IsOptional()
  @IsInt()
  branch_id?: number;

  @ApiPropertyOptional({ description: 'Page', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Taille de page', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'start_date' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'start_date';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}