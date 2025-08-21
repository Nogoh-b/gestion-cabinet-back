import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { TypeCreditDto } from '../../../type_credit/dto/typeCredit.dto';

export class TypeGuarantyDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  description: string;
}

export class UpdateTypeGuaranty extends PartialType(TypeGuarantyDto) {}
