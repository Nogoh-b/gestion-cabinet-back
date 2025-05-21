import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDocumentSavingAccountDto {
  @ApiProperty({ description: 'Nom du document', example: 'CNI recto' })
  @IsString()
  @IsNotEmpty()
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
}