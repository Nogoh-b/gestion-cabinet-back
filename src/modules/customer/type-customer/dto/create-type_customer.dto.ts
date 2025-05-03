// create-type-customer.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateTypeCustomerDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Type customer name',
    example: 'SARL',
  })
  name?: string;

  @IsString()
  @ApiProperty({
    description: 'Type customer description',
    example: 'Société a responsabilité limité',
  })
  @IsOptional()
  code?: string;

 /* @IsString()
  @ApiProperty({
    description: 'Type de document accepté pour le customer',
    example: 1,
  })
  @IsOptional()
  document_typeId?: number;*/

  @IsInt()
  @ApiProperty({
    description: 'Status',
    example: 1,
  })
  @IsOptional()
  status?: number;
}
