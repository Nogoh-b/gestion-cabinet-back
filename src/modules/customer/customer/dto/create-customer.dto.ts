// create-customer.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { IsInt, IsString, MaxLength, IsOptional, IsEmail, IsDate } from 'class-validator';

export class CreateCustomerDto {

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

  /*@IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  public_key?: string;

  @IsString()
  @ApiProperty()
  @MaxLength(45)
  @IsOptional()
  private_key?: string;*/

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
  @ApiProperty({required: true})
  @MaxLength(45)
  email?: string;


  @ApiProperty()
  @IsInt()
  type_customer_id: number;

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
  location_city_id: number;

  @ApiProperty()
  @Exclude()
  created_at: Date;

  @ApiProperty()
  @Exclude()
  updated_at: Date;

  /*@ApiProperty()
  @Exclude()
  public_key: string;

  @ApiProperty()
  @Exclude()
  private_key: string;

  @Exclude()
  @IsInt()
  @ApiProperty()
  @IsOptional()
  status?: number;*/
}
