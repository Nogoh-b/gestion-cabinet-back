// create-user.dto.ts
import { IsInt, IsString, IsEmail, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';



export class CreateUserDto {


  @ApiProperty({ required: true, example: 'superadmin' })
  @IsString()
  username: string;

  @ApiProperty({ required: true, example: 'john.doe@exemple.com' })
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: true, example: 'Admin@1234' })
  @IsString()
  password: string;

  /*@ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  codeOtp?: string;*/

  @ApiProperty()
  @IsInt()
  status: number;

  @ApiProperty()
  @IsInt()
  branch_id: number;

 

  @ApiProperty()
  @IsDateString()
  hire_date: string | Date;

  @ApiProperty({ required: true })
  @IsInt()
  @IsNotEmpty()
  customer_id: number;
}