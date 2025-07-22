import { IsEmail, IsNumber, IsString, IsIn, IsOptional } from 'class-validator';
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

  @ApiProperty({
    description: "Savings account code receiver",
    example: "SAV12345",
    required: false
  })
  @IsOptional()
  @IsString()
  targetSavingsAccountCode: string;
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

export class GenerateCotiOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SA12345678', description: 'Code du compte épargne à lier' })
  @IsString()
  savingsAccountCode: string;

  // @ApiProperty({ example: 'COTI-USER-001', description: 'Identifiant client dans le système COTI' })
  // @IsString()
  cotiCustomerCode: string;
}
