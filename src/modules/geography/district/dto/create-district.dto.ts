// district.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateDistrictDto {
  @IsString()
  @ApiProperty()
  @IsNotEmpty()
  name: string;

  @IsString()
  @ApiProperty()
  @IsNotEmpty()
  code: string;

  @IsInt()
  @ApiProperty()
  @IsNotEmpty()
  division_id: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;
}
