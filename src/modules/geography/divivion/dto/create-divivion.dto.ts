// division.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateDivisionDto {
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
  region_id: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;

  @IsInt()
  @IsOptional()
  status?: number;
}
