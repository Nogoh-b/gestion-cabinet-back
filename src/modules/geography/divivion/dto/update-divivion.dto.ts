// division.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional } from 'class-validator';



export class UpdateDivisionDto {
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
  region_id?: number;

  @IsString()
  @ApiProperty()
  @IsOptional()
  population?: string;

  @IsInt()
  @ApiProperty()
  @IsOptional()
  status?: number;
}