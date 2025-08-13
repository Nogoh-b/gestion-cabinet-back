import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TypeCreditDto {
  @ApiProperty({ description: 'id of credit', type: 'string', required: true })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'interest of credit',
    type: 'number',
    required: true,
  })
  @IsNumber()
  interest: number;

  @ApiProperty({
    description: 'description of credit',
    type: 'string',
    required: true,
  })
  @IsString()
  description: string;
  // During in days
  @ApiProperty({
    description: 'duringMax: period maximum of credit',
    type: 'number',
    required: true,
  })
  @IsNumber()
  duringMax: number;

  @ApiProperty({
    description: 'penality of credit',
    type: 'number',
    required: true,
  })
  @IsNumber()
  penality: number;

  @ApiProperty({
    description: 'eligibility_rating of credit',
    type: 'number',
    required: true,
  })
  @IsNumber()
  eligibility_rating: number;
}
