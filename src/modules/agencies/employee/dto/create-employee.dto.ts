
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsDateString } from 'class-validator';
export class CreateEmployeeDto {
  @ApiProperty()
  @IsInt()
  user_id: number;

  @ApiProperty()
  @IsInt()
  branch_id: number;

 

  @ApiProperty()
  @IsDateString()
  hire_date: Date;

  @ApiProperty()
  @IsInt()
  status: number;
}