import { Type } from 'class-transformer';
import { IsNotEmpty, IsDate, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';



export class CreateDocumentCustomerDto {


  @IsNumber()
  @Type(() => Number)
  @ApiProperty({example: 1})
  @IsNotEmpty()
  document_type_id: number;


  customer_id: number;

  status : number

  strict : boolean = true
 

  @IsOptional()
  @ApiProperty({example:'05/02/2025'})
  @IsDate()
  date_expired?: Date;

  @ApiProperty({ required: false, type: 'string', format: 'binary', example:  '{"fieldname":"documents[0][files]","originalname":"create-customer.dto.ts","encoding":"7bit","mimetype":"video/mp2t","buffer":{"type":"Buffer","data":[47,47,32,99,114,101,97,116,101,45,99,117,115,116,111,109,101,114,46,100,116,111,46,116,115,13,10,105,109,112,111,114,116,32,123,32,65,112,105,80,114,111,112,101,114,116,121,32,108,101,58,32,49,32,125,41,13,10,32,32,116,121,112,101,95,99,117,115,116,111,109,101,114,95,105,100,58,32,110,117,109,98,101,114,59,13,10,125,13,10]},"size":1660},"customer_id":20}' })
  file?:  Express.Multer.File;
}