// create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateUserDto {


  @ApiProperty({ required: true, example: 'nogoh@exemple.com' })
  @IsString()
  username: string;

  @ApiProperty({ required: true, example: 'john.doe@exemple.com' })
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: true, example: 'brice' })
  @IsString()
  password: string;

  /*@ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  codeOtp?: string;*/

  @ApiProperty()
  @IsInt()
  status: number;

  /*@ApiProperty({ enum: ['caisse', 'comptable', 'DG', 'DAF', 'PCA'] })
  @IsEnum(['caisse', 'comptable', 'DG', 'DAF', 'PCA'])
  type: string;*/

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  customer_id?: number;
}