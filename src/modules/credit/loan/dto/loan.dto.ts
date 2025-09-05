import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoanDto {
  @ApiProperty({
    description: 'Amount of loan',
    required: true,
    type: 'number',
  })
  @IsNumber()
  amount: number;

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

  @ApiProperty({
    required: true,
  })
  @IsString()
  reference: string;

  @ApiProperty({
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  credit_account_id: number;
}

export class DocumentFileLoanDto {
  @ApiProperty({
    required: true,
    type: 'string',
    format: 'binary',
    example:
      '{"fieldname":"documents[0][files]","originalname":"create-customer.dto.ts","encoding":"7bit","mimetype":"images;pdf","buffer":{"type":"Buffer","data":[47,47,32,99,114,101,97,116,101,45,99,117,115,116,111,109,101,114,46,100,116,111,46,116,115,13,10,105,109,112,111,114,116,32,123,32,65,112,105,80,114,111,112,101,114,116,121,32,108,101,58,32,49,32,125,41,13,10,32,32,116,121,112,101,95,99,117,115,116,111,109,101,114,95,105,100,58,32,110,117,109,98,101,114,59,13,10,125,13,10]},"size":1660},"customer_id":20}',
  })
  file: Express.Multer.File;
}

export class DocumentLoanDto extends DocumentFileLoanDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  typeOfDocument: number;
}

export class GuarantyDocumentLoanDto extends DocumentFileLoanDto {
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
