// region.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional } from 'class-validator';
 

export class UpdateRegionDto {
  @IsString()
  @ApiProperty()
  @IsOptional()
  name?: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  code?: string;

  @IsInt()
  @ApiProperty()
  @IsOptional()
  country_id?: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;
}