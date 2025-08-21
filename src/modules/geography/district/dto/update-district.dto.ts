// district.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional } from 'class-validator';



export class UpdateDistrictDto {
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
  division_id?: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;
}