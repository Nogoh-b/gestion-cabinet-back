import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';



export class SearchBranchDto {
  @ApiPropertyOptional({ example: 'BR-001' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Agence' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID de la ville' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  location_city_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(23)
  opening_hour?: number;

  @ApiPropertyOptional({ example: 17 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(23)
  closing_hour?: number;

}
