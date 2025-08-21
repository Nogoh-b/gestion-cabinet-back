// region.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRegionDto {
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
  @IsNotEmpty()
  country_id: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;
}
 