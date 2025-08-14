
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsDateString, IsOptional } from 'class-validator';
export class ResetPasswordRequestDto {
  // au moins l'un des deux doit être fourni
  @ApiProperty({ required: true, example: 'superadmin' })
  @IsOptional()
  @IsInt()
  id: number;
}

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

}