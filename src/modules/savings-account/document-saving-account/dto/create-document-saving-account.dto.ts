import { ApiProperty } from '@nestjs/swagger';

export class CreateDocumentSavingAccountDto { 
  @ApiProperty({ description: 'Nom du document', example: 'CNI recto' })
  name: string;

  @ApiProperty({ description: "ID du type de document", example: 1 })
  document_type_id: number;

  @ApiProperty({ description: "ID du client", example: 42 })
  customer_id: number;
}