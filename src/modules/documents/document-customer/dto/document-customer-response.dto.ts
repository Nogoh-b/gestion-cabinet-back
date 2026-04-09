// document-customer-response.dto.ts
import { Expose, Transform } from 'class-transformer';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';













export enum DocumentCustomerStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
  EXPIRED = 3,
  ARCHIVED = 4,
}


export class DocumentCustomerResponseDto {
  @ApiProperty()
  @Expose()
  id: number;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.file_path?.split('/').pop() || '')
  filename: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.original_filename || obj.name)
  original_name: string;

  @ApiPropertyOptional()
  @Expose()
  file_path?: string;

  @ApiPropertyOptional()
  @Expose()
  file_size?: number;

  @ApiPropertyOptional()
  @Expose()
  // @Transform(({ value }) => MimeTypeUtils.getFileTypeName(value))
  file_mimetype?: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.category)
  category: DocumentCategory;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.document_type?.id)
  document_type_id: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.document_type ? {
    id: obj.document_type.id,
    name: obj.document_type.name,
    code: obj.document_type.code,
  } : undefined)
  document_type?: {
    id: number;
    name: string;
    code: string;
  };

  @ApiProperty({ enum: DocumentCustomerStatus })
  @Expose()
  status: DocumentCustomerStatus;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.dossier?.id)
  dossier_id: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.dossier ? {
    id: obj.dossier.id,
    dossier_number: obj.dossier.dossier_number,
    objet: obj.dossier.objet,
    // name: obj.dossier.dossier_number,
  } : undefined)
  dossier?: {
    id: number;
    dossier_number: string;
    // name: string;
    objet: string;
  };

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.customer?.id)
  customer_id?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.customer ? {
    id: obj.customer.id,
    full_name: obj.customer.full_name,
    customer_code: obj.customer.customer_code,
    company_name: obj.customer.company_name,
  } : undefined)
  customer?: {
    id: number;
    full_name: string;
    customer_code: string;
    company_name?: string;
  };

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.uploaded_by?.id)
  uploaded_by_id: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.uploaded_by ? {
    id: obj.uploaded_by.id,
    first_name: obj.uploaded_by.first_name,
    last_name: obj.uploaded_by.last_name,
    full_name: `${obj.uploaded_by.first_name} ${obj.uploaded_by.last_name}`,
  } : undefined)
  uploaded_by?: {
    id: number;
    first_name: string;
    last_name: string;
    full_name: string;
  };

  @ApiPropertyOptional()
  @Expose()
  audience_id?: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.audience ? {
    id: obj.audience.id,
    audience_date: obj.audience.audience_date,
    jurisdiction: obj.audience.jurisdiction,
  } : undefined)
  audience?: {
    id: number;
    audience_date: Date;
    jurisdiction: string;
  };

  @ApiProperty()
  @Expose()
  version: number;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.previous_version?.id)
  previous_version_id?: number;

  @ApiPropertyOptional()
  @Expose()
  description?: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.keywords?.join(', '))
  keywords?: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.uploaded_at)
  document_date?: Date;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.date_validation)
  validation_date?: Date;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.date_ejected)
  rejection_date?: Date;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.date_expired)
  expiration_date?: Date;

  @ApiPropertyOptional()
  @Expose()
  archival_date?: Date;

  @ApiPropertyOptional()
  @Expose()
  @Transform(({ obj }) => obj.metadata?.audit_trail?.find((a: any) => a.action === 'rejected')?.details)
  rejection_reason?: string;

  // Champs calculés
  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.file_size) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(obj.file_size) / Math.log(1024));
    return Math.round(obj.file_size / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  })
  file_size_formatted: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const statusLabels = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Refusé', 
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };
    return statusLabels[obj.status] || 'Inconnu';
  })
  status_label: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const mimeIcons = {
      'application/pdf': 'fa-file-pdf',
      'image/': 'fa-file-image',
      'text/': 'fa-file-text',
      'application/msword': 'fa-file-word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fa-file-word',
      'application/vnd.ms-excel': 'fa-file-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fa-file-excel',
      'default': 'fa-file'
    };
    
    for (const [key, icon] of Object.entries(mimeIcons)) {
      if (obj.file_mimetype?.startsWith(key)) return icon;
    }
    return mimeIcons.default;
  })
  file_type_icon: string;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.status === DocumentCustomerStatus.ACCEPTED)
  is_validated: boolean;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.status === DocumentCustomerStatus.PENDING)
  is_pending: boolean;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.status === DocumentCustomerStatus.REFUSED)
  is_rejected: boolean;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => obj.status === DocumentCustomerStatus.EXPIRED)
  is_expired: boolean;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => {
    const allowedStatuses = [
      DocumentCustomerStatus.PENDING,
      DocumentCustomerStatus.ACCEPTED
    ];
    return allowedStatuses.includes(obj.status) && !!obj.file_path;
  })
  can_be_downloaded: boolean;

  @ApiProperty()
  @Expose()
  @Transform(({ obj }) => !!obj.previous_version_id)
  has_previous_versions: boolean;

  // Champs additionnels de l'entité
  @ApiProperty()
  @Expose()
  is_current_version: boolean;

  @ApiProperty()
  @Expose()
  uploaded_at: Date;

  @ApiProperty()
  @Expose()
  last_modified: Date;

  @ApiProperty()
  @Expose()
  required_for_hearing: boolean;

  @ApiProperty()
  @Expose()
  is_confidential: boolean;

  @ApiPropertyOptional()
  @Expose()
  metadata?: {
    keywords?: string[];
    page_count?: number;
    language?: string;
    original_filename?: string;
    audit_trail?: Array<{
      action: string;
      user_id: number;
      timestamp: Date;
      details?: string;
    }>;
  };

  // Méthodes utilitaires exposées
  // @ApiProperty()
  // @Expose()
  // @Transform(({ obj }) => obj.category === DocumentCategory.PROCEDURAL)
  // is_procedural_document: boolean;

  // @ApiProperty()
  // @Expose()
  // @Transform(({ obj }) => obj.category === DocumentCategory.CLIENT)
  // is_client_document: boolean;

  // @ApiProperty()
  // @Expose()
  // @Transform(({ obj }) => obj.category === DocumentCategory.INTERNAL)
  // is_internal_document: boolean;

  // @ApiProperty()
  // @Expose()
  // @Transform(({ obj }) => obj.canBeModified())
  // can_be_modified: boolean;

  // @ApiProperty()
  // @Expose()
  // @Transform(({ obj }) => obj.requiresValidation())
  // requires_validation: boolean;
}