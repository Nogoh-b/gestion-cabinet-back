// document-customer-response.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import { UPLOAD_DOCS_FOLDER_NAME, UPLOAD_FOLDER_NAME } from 'src/core/common/constants/constants';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { ApiProperty } from '@nestjs/swagger';


export class DocumentCustomerResponseDto {
  @Expose()
  @ApiProperty({
    example: 1,
    description: 'ID unique du document'
  })
  id: number;

  @Expose()
  @ApiProperty({
    example: 'Passeport 2023',
    description: 'Nom personnalisé du document'
  })
  name: string;

  @Expose()
  @ApiProperty({
    example: 2,
    description: 'ID du type de document référencé'
  })
  document_type_id: number;

  @Expose()
  @ApiProperty({ 
    example: 1,
    description: 'Statut (0 = en attente, 1 = validé, 2 = rejeté)',
    enum: [0, 1, 2]
  })
  status: number;

  @Expose()
  @Transform(({ obj }) => `http://${process.env.API_HOST || 'localhost:3004'}/${UPLOAD_FOLDER_NAME}/${UPLOAD_DOCS_FOLDER_NAME}/${obj.file_path}`)
  @ApiProperty({
    example: 'http://localhost:3000/uploads/abc123-passeport.pdf',
    description: 'URL complète de téléchargement'
  })
  file_url: string;

  @Expose()
  @ApiProperty({
    example: 'http://localhost:3000/uploads/abc123-passeport.pdf',
    description: 'URL complète de téléchargement'
  })
  file_path: string;

  @Expose()
  @Type(() => Date)
  @ApiProperty({
    type: Date,
    description: 'Date de validation du document'
  })
  date_validation: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty({
    type: Date,
    description: 'Date de rejet du document'
  })
  date_ejected: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty({
    type: Date,
    description: 'Date d\'expiration du document'
  })
  date_expired: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty({
    type: Date,
    description: 'Date de création'
  })
  created_at: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty({
    type: Date,
    description: 'Date de dernière mise à jour'
  })
  updated_at: Date;

  @Expose()
  @ApiProperty({
    example: 456,
    description: 'ID du client associé'
  })
  customer_id: number;

  savings_account : SavingsAccount;
}