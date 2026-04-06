import { ApiProperty } from "@nestjs/swagger";



import { DocumentCustomerStatus } from "../entities/document-customer.entity";





export class SearchDocumentCustomerDto {
  @ApiProperty({ example: "contrat", required: false })
  search?: string;

  @ApiProperty({ enum: DocumentCustomerStatus, required: false })
  status?: DocumentCustomerStatus;

  @ApiProperty({  required: false })
  category_id?: number;

  @ApiProperty({ example: 1, required: false })
  dossier_id?: number;

  @ApiProperty({ example: 1, required: false })
  customer_id?: number;

  @ApiProperty({ example: 1, required: false })
  document_type_id?: number;
  
  @ApiProperty({ example: 'b9d6c1dd-664c-4924-b359-fd77337da47e', required: false })
  'subStages.id'?: string;

  @ApiProperty({ example: "2024-01-01", required: false })
  date_from?: string;

  @ApiProperty({ example: "2024-12-31", required: false })
  date_to?: string;

  @ApiProperty({ example: "filename", required: false })
  sort_by?: string;

  @ApiProperty({ example: "DESC", required: false })
  sort_direction?: "ASC" | "DESC";
}