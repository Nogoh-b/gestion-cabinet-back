// document-customer-response.dto.ts

// document-saving-account-response.dto.ts
import { Expose, Transform, Type } from 'class-transformer';
import { UPLOAD_DOCS_FOLDER_NAME, UPLOAD_FOLDER_NAME } from 'src/core/common/constants/constants';
import { ApiProperty } from '@nestjs/swagger';

import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';


export class DocumentSavingAccountResponseDto {
  @Expose()
  @ApiProperty({ example: 1, description: 'ID unique du document' })
  id: number;

  @Expose()
  @ApiProperty({ example: 'Passeport 2023', description: 'Nom personnalisé du document' })
  name: string;

  @Expose()
  @ApiProperty({ example: 2, description: 'ID du type de document référencé' })
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
  @ApiProperty({ example: 'abc123-passeport.pdf', description: 'Chemin du fichier' })
  file_path: string;

  @Expose()
  @ApiProperty({ example: 1024, description: 'Taille du fichier en octets' })
  file_size: number;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date, description: 'Date de validation du document' })
  date_validation: Date | null;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date, description: 'Date de rejet du document' })
  date_ejected: Date | null;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date, description: 'Date d\'expiration du document' })
  date_expired: Date | null;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date, description: 'Date de création' })
  created_at: Date;

  @Expose()
  @Type(() => Date)
  @ApiProperty({ type: Date, description: 'Date de dernière mise à jour' })
  updated_at: Date;

  @Expose()
  @ApiProperty({ example: 456, description: 'ID du client associé' })
  customer_id: number;

  @Expose()
  @ApiProperty({ example: 123, description: 'ID du compte épargne associé' })
  savings_account_id: number| null;

  @Expose()
  @ApiProperty({ example: 123, description: 'ID du compte épargne associé' })
  savings_account: SavingsAccount;

  @Expose()
  @ApiProperty({ example: 1, description: 'ID de l\'agence du compte épargne' })
  savings_account_branch_id: number| null;

  /*constructor(partial: Partial<DocumentSavingAccount>) {
    Object.assign(this, partial);
    this.savings_account_id = partial.savings_account?.id ?? -1;
    this.savings_account_branch_id = partial.savings_account?.branch_id ?? -1;
  }*/
}