import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ example: 'owner@kabysoft.com' })
  @IsEmail()
  @MaxLength(150)
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class PlatformVerifyOtpDto {
  @ApiProperty({ description: 'Défi renvoyé par /platform/auth/login' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  challenge: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class PlatformForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(150)
  email: string;
}

export class PlatformSetPasswordDto {
  @ApiProperty({ description: "Jeton reçu par email (invitation ou réinitialisation)" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class PlatformChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  current_password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  new_password: string;
}
