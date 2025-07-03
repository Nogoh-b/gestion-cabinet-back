import { IsEmail, IsNumber, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';


export class SendOtpDto {
  @ApiProperty({
    description: "Email address of the user",
    example: "user@example.com",
    required: true
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "Type of transaction",
    example: 1,
    default: 1,
    required: true
  })
  @IsNumber()
  transactionType: number;

  @ApiProperty({
    description: "Transaction amount",
    example: 1000,
    default: 0,
    required: true
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: "Payment provider",
    example: "MOMO",
    default: "MOMO",
    enum: ['MOMO', 'OM'],
    required: true
  })
  @IsString()
  @IsIn(['MOMO', 'OM'])
  provider: string;

  @ApiProperty({
    description: "Savings account code",
    example: "SAV12345",
    required: true
  })
  @IsString()
  savingsAccountCode: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: "Email address of the user",
    example: "user@example.com",
    required: true
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "OTP code received by the user",
    example: "123456",
    required: true
  })
  @IsString()
  code: string;
}