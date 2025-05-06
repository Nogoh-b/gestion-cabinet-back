import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsDateString } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsInt()
  location_city_id: number;

  @ApiProperty()
  @IsDateString()
  opening_date: Date;

  @ApiProperty()
  @IsInt()
  status: number;
}