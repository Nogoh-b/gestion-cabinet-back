import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsDate, IsOptional } from 'class-validator';

export class CreateDocumentFromCotiDto {
  @IsString()
  @ApiProperty({example:'Passport'})
  @IsNotEmpty()
  name: string;

  @IsInt()
  @ApiProperty({example: 1})
  @IsNotEmpty()
  documentTypeId: number;

  @IsInt()
  @ApiProperty({example: 1})
  @IsNotEmpty()
  customerId: number;

  @IsOptional()
  @ApiProperty({example: '05/02/2025'})
  @IsDate()
  dateValidation?: Date;

  @IsOptional()
  @ApiProperty({example: '05/02/2025'})
  @IsDate()
  dateEjected?: Date;

  @IsOptional()
  @ApiProperty({example:'05/02/2025'})
  @IsDate()
  dateExpired?: Date;

  @ApiProperty({ required: false, type: 'string', format: 'binary' })
  file?:  Express.Multer.File;
}