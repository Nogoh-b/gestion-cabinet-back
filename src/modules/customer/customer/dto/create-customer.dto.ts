// create-customer.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  MaxLength,
  IsOptional,
  IsEmail,
  IsDate,
  IsPhoneNumber,
  IsEmpty,
} from 'class-validator';
import { CustomerCreatedFrom } from '../entities/customer.entity';

export class CreateCustomerDto {
  @IsString()
  @MaxLength(45)
  @ApiProperty({ example: 'John', description: 'Customer Name' })
  @IsOptional()
  firt_name?: string;

  @IsString()
  @MaxLength(45)
  @ApiProperty({ example: 'Doe', description: 'Customer Last Name' })
  @IsOptional()
  last_name?: string;

  @IsOptional()
  @ApiProperty({ example: 1 , description: 'identifiant de la branche' })
  @IsEmpty()
  branch_id: number;

  customer_code: string

  @IsPhoneNumber()
  @ApiProperty({ required: true, example: '+216 55 55 55 55' })
  @MaxLength(45)
  number_phone_1?: string;

  @IsPhoneNumber()
  @ApiProperty({ example: '+216 55 55 55 55' })
  @MaxLength(45)
  @IsOptional()
  number_phone_2?: string;

  @IsEmail()
  @ApiProperty({ required: true, example: 'john.doe@gmail.com' })
  @MaxLength(45)
  email?: string;

  @IsString()
  @ApiProperty({ example: '00000000000000000' })
  @MaxLength(45)
  nui?: string;

  @IsString()
  @ApiProperty({ example: '00000000000000000' })
  @MaxLength(45)
  @IsOptional()
  rccm?: string;

  @IsDate()
  @ApiProperty({ example: '2020-01-01' })
  @IsOptional()
  birthday?: Date;

  created_from : CustomerCreatedFrom

  @Type(() => Number)
  @ApiProperty({ example: 1 })
  @IsInt()
  location_city_id: number;

  @Type(() => Number)
  @IsInt()
  @ApiProperty({ example: 1 })
  type_customer_id: number;
}
