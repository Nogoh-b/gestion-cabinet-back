import { IsArray, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GuarantyEstimation } from '../../guaranty/garanty_estimation/entity/guaranty_estimation.entity';

export class LoanDto {
  @ApiProperty({
    description: 'Amount of loan',
    required: true,
    type: 'number',
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'reimbursement_amount of loan',
    required: true,
    type: 'number',
  })
  @IsNumber()
  reimbursement_amount: number;

  // in days
  @ApiProperty({
    description: 'During of loan',
    required: true,
    type: 'number',
  })
  @IsNumber()
  duringMax: number;

  // in days
  @ApiProperty({
    required: true,
  })
  @IsString()
  object: string;

  // in days
  @ApiProperty({
    required: true,
  })
  @IsString()
  comment: string;
}

export class DocumentsLoanDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}


export class GuarantiesLoanDto extends DocumentsLoanDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  value: number;

  @ApiProperty({
    required: true,
  })
  @IsNumber()
  typeGuaranty: number;
}

export class SubmitLoanDto {
  @ApiProperty({
    required: true,
  })
  @IsArray()
  documents: string[];
}
