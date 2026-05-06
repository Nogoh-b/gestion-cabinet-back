import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseReportStatus } from '../entities/expense-report.entity';

export class ExpenseReportSearchDto {
  @ApiPropertyOptional({ description: 'Recherche texte (titre, notes)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par employé' })
  @IsOptional()
  @IsInt()
  employee_id?: number;

  @ApiPropertyOptional({ enum: ExpenseReportStatus })
  @IsOptional()
  @IsEnum(ExpenseReportStatus)
  status?: ExpenseReportStatus;

  @ApiPropertyOptional({ description: 'Date soumission minimum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submission_date_from?: Date;

  @ApiPropertyOptional({ description: 'Date soumission maximum' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submission_date_to?: Date;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'submission_date' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'submission_date';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}