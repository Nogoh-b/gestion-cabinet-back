// advanced-search.dto.ts

import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  ArrayNotEmpty,
  ValidateNested,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsIn
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


class OrderByDto {
  @ApiProperty({
    description: 'Field to sort by (supports nested relations)',
    example: 'created_at'
  })
  @IsString()
  field: string;

  @ApiPropertyOptional({
    enum: ['ASC', 'DESC'],
    description: 'Sort direction',
    default: 'ASC'
  })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  direction?: 'ASC' | 'DESC';
}

export class AdvancedSearchOptionsDto {
  @ApiProperty({
    description: 'Main entity alias',
    example: 'user'
  })
  @IsString()
  @IsNotEmpty()
  alias: string;

  @ApiProperty({
    type: [String],
    description: 'Fields to search in (supports nested relations)',
    example: ["last_name", "location_city.name"]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  searchFields: string[];

  @ApiProperty({
    description: 'Search term to look for',
    example: 'D'
  })
  @IsString()
  @IsNotEmpty()
  searchTerm: string;

  @ApiPropertyOptional({
    description: 'Enable exact match search',
    default: false
  })
  @IsBoolean()
  @IsOptional()
  exactMatch?: boolean = false;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    minimum: 0,
    example: 0
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  skip?: number;

  @ApiPropertyOptional({
    description: 'Number of results to take',
    minimum: 1,
    example: 1
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  take?: number;

  @ApiPropertyOptional({
    type: OrderByDto,
    description: 'Sorting criteria'
  })
  @ValidateNested()
  @Type(() => OrderByDto)
  @IsOptional()
  orderBy?: OrderByDto;
}


export class SearchQueryDto {
  @IsString()
  term: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true') // transforme string en bool
  @IsString()
  exact: string = 'false';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  skip: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  take: number = 10;

  @IsOptional()
  @IsString()
  orderField: string = 'create_at';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  @Transform(({ value }) => (value || 'ASC').toUpperCase())
  orderDir: 'ASC' | 'DESC' = 'ASC';
}
