import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsEnum, IsInt, IsNotEmpty, IsArray, ArrayNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';




export class KycSyncItemDto {
  @ApiProperty({ example: 'CUST001' })
  @IsString()
  code_customer!: string;

  @ApiProperty({ example: 97 })
  @IsInt()
  personne_id!: number;

  @ApiProperty({ example: 3, required: false })
  @IsInt()
  bank_system_idbank_system?: number;
}

export class KycSyncDto {
  @ApiProperty({
    type: [KycSyncItemDto],
    example: [
      { code_customer: 'CUST001', personne_id: 97, bank_system_idbank_system: 3 },
      { code_customer: 'CUST002', personne_id: 102, bank_system_idbank_system: 1 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => KycSyncItemDto)
  items!: KycSyncItemDto[];
}



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

