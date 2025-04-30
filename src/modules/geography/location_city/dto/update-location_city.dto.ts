// create-location-city.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional } from 'class-validator';


export class UpdateLocationCityDto {
  @IsString()
  @ApiProperty()
  @IsOptional()
  name?: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  code?: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;

  @IsInt()
  @ApiProperty()
  @IsOptional()
  districts_id?: number;
}