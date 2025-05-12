// create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsEmail, IsNotEmpty } from 'class-validator';

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

  /*@ApiProperty({ enum: ['caisse', 'comptable', 'DG', 'DAF', 'PCA'] })
  @IsEnum(['caisse', 'comptable', 'DG', 'DAF', 'PCA'])
  type: string;*/

  @ApiProperty({ required: true })
  @IsInt()
  @IsNotEmpty()
  customer_id: number;
}