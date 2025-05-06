import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsOptional, IsEmpty, IsEnum, IsInt } from 'class-validator';

export enum DocTypeCode {
  FRONT_CNI = 'front_cni',
  BACK_CNI = 'user',
  SELFIE = 'selfie',
}
export class CreateDocumentFromCotiDto {

  @IsEnum(DocTypeCode)
  @ApiProperty({ example: 1, required: true,description: 'le code du document doit être : front_cni |  user |  selfie | ' })
  @IsEmpty()
  document_type_code: DocTypeCode;

  @IsInt()
  @ApiProperty({ example: 1 })
  @IsOptional()
  customer_id: number;

  @IsOptional()
  @ApiProperty({ example: '05/02/2025', required: false })
  @IsDate()
  date_expired?: Date;

  @ApiProperty({
    required: false,
    type: 'string',
    format: 'binary',
  })
  file?: Express.Multer.File;
}

