// create-customer.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, IsOptional, IsEmail, IsDate } from 'class-validator';

export class CreateCustomerDto {
  @IsInt()
  id: number;

  @IsString()
  @MaxLength(45)
  @ApiProperty()
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(45)
  @ApiProperty()
  @IsOptional()
  first_name?: string;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  public_key?: string;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  private_key?: string;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  number_phone_1?: string;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  number_phone_2?: string;

  @IsEmail()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  email?: string;

  @ApiProperty()
  @IsInt()
  districts_id: number;

  @ApiProperty()
  @IsInt()
  typeCustomer_id: number;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  nui?: string;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  rccm?: string;

  @IsDate()
  @ApiProperty()
  @IsOptional()
  birthday?: Date;

  @ApiProperty()
  @IsInt()
  locationCity_id: number;

  @IsInt()
  @ApiProperty()
  @IsOptional()
  status?: number;
}
