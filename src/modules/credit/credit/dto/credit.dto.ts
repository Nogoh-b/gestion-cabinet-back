import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreditDto {
  @ApiProperty({
    description: 'Amount of credit',
    required: true,
    type: 'string',
  })
  @IsNumber()
  amount: number;

  @IsNumber()
  reimbursement_amount: number;

  // in days
  @IsNumber()
  duringMax: number;
}
