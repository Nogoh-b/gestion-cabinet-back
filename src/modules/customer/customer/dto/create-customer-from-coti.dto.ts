// create-customer.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Type } from 'class-transformer';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsEmail,
  IsDate,
  ValidateNested,
  IsInt,
  IsPhoneNumber,
} from 'class-validator';
import { CreateDocumentFromCotiDto } from 'src/modules/documents/document-customer/dto/create-document-from-coti.dto';

export class CreateCustomerFromCotiDto {


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
  @IsOptional()
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

  @Type(() => Number)
  @ApiProperty({ example: 1 })
  @IsInt()
  location_city_id: number;

  @Type(() => Number)
  @IsInt()
  @ApiProperty({ example: 1 })
  type_customer_id: number;

  @Type(() => CreateDocumentFromCotiDto) // <- transformation correcte des éléments du tableau
  @ValidateNested({ each: true })        // <- validation pour chaque élément
  @ApiProperty({ type: [CreateDocumentFromCotiDto], required: false })
  @Exclude()
  @IsOptional()
  documents: CreateDocumentFromCotiDto[];
}
