// src/modules/documents/document-type/dto/document-type-stats.dto.ts
import { Expose } from 'class-transformer';
export class DocumentTypeUsageStatsDto {
  @Expose()
  totalDocuments: number;

  @Expose()
  averagePerType: number;

  @Expose()
  mostUsedType: {
    id: number;
    name: string;
    code: string;
    count: number;
  };

  @Expose()
  leastUsedType: {
    id: number;
    name: string;
    code: string;
    count: number;
  };

  @Expose()
  requiredDocumentsCount: number;

  @Expose()
  optionalDocumentsCount: number;
}

export class DocumentTypeStatsDto {
  @Expose()
  total: number;

  @Expose()
  active: number;

  @Expose()
  inactive: number;

  @Expose()
  required: number;

  @Expose()
  optional: number;

  @Expose()
  byStatus: DocumentTypeStatusStatsDto[];

  @Expose()
  byCustomerType: DocumentTypeCustomerTypeStatsDto[];

  @Expose()
  topDocumentTypes: TopDocumentTypeDto[];

  @Expose()
  usageStats: DocumentTypeUsageStatsDto;

  @Expose()
  mimeTypeStats: MimeTypeStatsDto[];
}

export class DocumentTypeStatusStatsDto {
  @Expose()
  status: string;

  @Expose()
  code: number;

  @Expose()
  count: number;

  @Expose()
  percentage: number;

  @Expose()
  color?: string;
}

export class DocumentTypeCustomerTypeStatsDto {
  @Expose()
  customerTypeId: number;

  @Expose()
  customerTypeName: string;

  @Expose()
  documentTypeId: number;

  @Expose()
  documentTypeName: string;

  @Expose()
  count: number;
}

export class TopDocumentTypeDto {
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  name: string;

  @Expose()
  documentsCount: number;

  @Expose()
  isRequired: boolean;

  @Expose()
  mimeType: string;

  @Expose()
  customerTypesCount: number;
}


export class MimeTypeStatsDto {
  @Expose()
  mimeType: string;

  @Expose()
  count: number;

  @Expose()
  percentage: number;

  @Expose()
  documents: number;
}