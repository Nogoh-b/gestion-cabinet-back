import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayslipStatus } from '../entities/payslip.entity';

export class PayslipSearchDto {
  @ApiPropertyOptional({ description: 'Filtrer par employé' })
  @IsOptional()
  @IsInt()
  employee_id?: number;

  @ApiPropertyOptional({ description: 'Filtrer par période de paie' })
  @IsOptional()
  @IsInt()
  period_id?: number;

  @ApiPropertyOptional({ enum: PayslipStatus, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(PayslipStatus)
  status?: PayslipStatus;

  @ApiPropertyOptional({ description: 'Recherche texte (nom employé, libellé période)' })
  @IsOptional()
  @IsString()
  search?: string;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'created_at' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'DESC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'DESC';
}