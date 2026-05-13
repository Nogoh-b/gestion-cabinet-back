// referrer-search.dto.ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReferrerType } from '../entities/referral.entity';

export class ReferrerSearchDto {
  @ApiPropertyOptional({ description: 'Recherche par nom ou contact' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ReferrerType })
  @IsOptional()
  @IsEnum(ReferrerType)
  referrer_type?: ReferrerType;

  @ApiPropertyOptional({ description: 'Filtrer les internes' })
  @IsOptional()
  is_internal?: boolean;

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

  @ApiPropertyOptional({ description: 'Champ de tri', example: 'company_name' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'company_name';

  @ApiPropertyOptional({ description: 'Ordre de tri', example: 'ASC' })
  @IsOptional()
  @IsString()
  order?: 'ASC' | 'DESC' = 'ASC';
}