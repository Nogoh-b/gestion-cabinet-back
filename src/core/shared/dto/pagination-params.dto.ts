// src/common/dto/pagination-params.dto.ts
import { IsOptional, IsNumber, Min, Max, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

export class PaginationParamsDto {
  
  @ApiPropertyOptional({
    description: 'Numéro de page',
    example: 1,
    minimum: 1,
    default: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Nombre d\'éléments par page',
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Champ de tri',
    example: 'created_at'
  })
  @IsOptional()
  @IsString()
  sort_by?: string = 'created_at';

  @ApiPropertyOptional({
    description: 'Direction du tri',
    enum: SortDirection,
    example: SortDirection.DESC
  })
  @IsOptional()
  @IsEnum(SortDirection)
  sort_direction?: SortDirection = SortDirection.DESC;

  get skip(): number {
    const page = this.page ?? 1;
    const limit = this.limit ?? 10;
    return (page - 1) * limit;
  }

  get take(): number {
    return this.limit ?? 10;
  }
}