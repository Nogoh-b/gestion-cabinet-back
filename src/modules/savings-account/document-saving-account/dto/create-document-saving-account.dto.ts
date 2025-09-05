import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';


import { DocumentSavingAccountStatus } from '../document-saving-account.service';



export class CreateDocumentSavingAccountDto {
  /*@ApiProperty({ description: 'Nom du document', example: 'CNI recto' })
  @IsString()
  @IsNotEmpty()*/
  name: string;

  @ApiProperty({ description: 'ID du type de document', example: 1 })
  @Type(() => Number)
  @IsInt()
  document_type_id: number;

  @ApiProperty({ description: "ID du compte épargne", example: 5 })
  @Type(() => Number)
  @IsInt()
  savings_account_id: number;

  @ApiProperty({ required: false, type: 'string', format: 'binary', example:  '' })
  file?:  Express.Multer.File;
  status?:  number = DocumentSavingAccountStatus.PENDING;
}