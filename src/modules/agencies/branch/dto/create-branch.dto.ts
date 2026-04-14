import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsISO8601, IsOptional } from 'class-validator';

export class CreateBranchDto {

  code : string 
  
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsInt()
  location_city_id: number;

  @ApiPropertyOptional({ example: '2025-05-07T12:07:39.970Z' })
  @IsISO8601()
  @IsOptional()
  creation_date: string;

  @IsInt()
  @ApiProperty()
  opening_hour: string;
  
  @IsInt()
  @ApiProperty()
  closing_hour: string;

 
  status: number;
}