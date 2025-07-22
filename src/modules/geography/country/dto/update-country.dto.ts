import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';


export class UpdateCountryDto {
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
}