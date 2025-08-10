import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsOptional, IsEnum, IsInt, IsNotEmpty } from 'class-validator';

export enum DocTypeNameOnline {
  FRONT_CNI = 'front_cni',
  BACK_CNI = 'back_cni',
  SELFIE = 'selfie',
  HALF_PHOTO_CARD = 'half_photo_card',
}
export class CreateDocumentFromCotiDto {
  @ApiProperty({ example: DocTypeNameOnline.FRONT_CNI, required: true })
  @IsEnum(DocTypeNameOnline)
  @IsNotEmpty()
  document_type_name: DocTypeNameOnline;

  @IsInt()
  @ApiProperty({ example: 1, required: true })
  customer_id: number;

  @IsOptional()
  @ApiProperty({ example: '05/02/2025', required: false })
  @IsDate()
  date_expired?: Date;

  document_type_id? : number

  @ApiProperty({
    required: false,
    type: 'string',
    format: 'binary',
  })
  file?: Express.Multer.File;
}

