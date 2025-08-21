// create-location-city.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateLocationCityDto {
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
  @IsNotEmpty()
  districts_id: number;
}
