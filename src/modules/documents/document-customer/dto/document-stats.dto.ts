// src/modules/documents/dto/document-stats.dto.ts

import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class DocumentStatsDto extends BaseStatsDto {
  // Vue d'ensemble
  totalSize: number;
  averageSize: number;
  pendingValidation: number;
  validated: number;
  rejected: number;
  expired: number;
  
  // Distributions
  byType: DistributionItem[];
  byCategory: DistributionItem[];
  byStatus: DistributionItem[];
  byMimeType: DistributionItem[];
  byDossier: DistributionItem[];
  byUploader: DistributionItem[];
  
  // Statistiques de stockage
  storageStats: StorageStatsDto;
  
  // Documents récents
  recentDocuments: RecentDocumentDto[];
  
  // Documents à valider
  pendingDocuments: PendingDocumentDto[];
  
  // Tendances
  uploadTrend: UploadTrendDto[];
}

export class StorageStatsDto {
  totalSize: number;
  totalSizeFormatted: string;
  averageSize: number;
  largestDocument: {
    name: string;
    size: number;
    sizeFormatted: string;
    dossierNumber: string;
  };
  byMimeType: StorageByMimeTypeDto[];
}

export class StorageByMimeTypeDto {
  mimeType: string;
  count: number;
  totalSize: number;
  totalSizeFormatted: string;
  percentage: number;
}

export class RecentDocumentDto {
  id: number;
  name: string;
  dossierNumber: string;
  clientName: string;
  type: string;
  category: string;
  status: number;
  size: number;
  sizeFormatted: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export class PendingDocumentDto {
  id: number;
  name: string;
  dossierNumber: string;
  clientName: string;
  type: string;
  uploadedBy: string;
  uploadedAt: Date;
  daysPending: number;
}

export class UploadTrendDto {
  date: string;
  count: number;
  totalSize: number;
}