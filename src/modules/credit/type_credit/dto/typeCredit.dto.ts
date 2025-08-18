import { IsEnum, IsNumber, IsString } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { MODE_REIMBURSEMENT_PERIOD } from '../../../../utils/types';

export class TypeCreditDto {
  @ApiProperty({ description: 'id of loan', type: 'string', required: true })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'interest of loan',
    type: 'number',
    required: true,
  })
  @IsNumber()
  interest: number;

  @ApiProperty({
    description: 'description of loan',
    type: 'string',
    required: true,
  })
  @IsString()
  description: string;
  // During in days
  @ApiProperty({
    description: 'duringMax: period maximum of loan',
    required: true,
  })
  @IsEnum(MODE_REIMBURSEMENT_PERIOD)
  reimbursement_period: MODE_REIMBURSEMENT_PERIOD;

  @ApiProperty({
    description: 'penality of loan',
    type: 'number',
    required: true,
  })
  @IsNumber()
  penality: number;

  @ApiProperty({
    description: 'eligibility_rating of loan',
    type: 'number',
    required: true,
  })
  @IsNumber()
  eligibility_rating: number;

  @ApiProperty({
    description: 'code of loan',
    type: 'string',
    required: true,
  })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'eligibility_rating of loan',
    type: 'number',
    required: true,
  })
  @IsNumber()
  fee: number;
}

export class GuarantyCreditsDto {
  @ApiProperty()
  @IsNumber()
  id: number;
}

export class GuarantyChangeCreditsDto {
  @ApiProperty()
  @IsNumber()
  from: number;

  @ApiProperty()
  @IsNumber()
  to: number;
}

export class UpdateTypeCredit extends PartialType(TypeCreditDto) {}