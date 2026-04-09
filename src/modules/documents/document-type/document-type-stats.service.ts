// src/modules/documents/document-type/services/document-type-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentType } from './entities/document-type.entity';
import { TypeCustomer } from './../../customer/type-customer/entities/type_customer.entity';
import {
  DocumentTypeStatsDto,
  DocumentTypeStatusStatsDto,
  DocumentTypeCustomerTypeStatsDto,
  TopDocumentTypeDto,
  DocumentTypeUsageStatsDto,
  MimeTypeStatsDto
} from './dto/document-type-stats.dto';
import { SingleDocumentTypeStatsDto } from './dto/single-document-type-stats.dto';
import { DocumentCustomerStatus } from './../document-customer/entities/document-customer.entity';

@Injectable()
export class DocumentTypeStatsService {
  constructor(
    @InjectRepository(DocumentType)
    private documentTypeRepository: Repository<DocumentType>,
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
  ) {}

  async getStats(typeId?: number): Promise<DocumentTypeStatsDto | SingleDocumentTypeStatsDto> {
    // Si un typeId est fourni, on retourne les stats détaillées de ce type
    if (typeId) {
      return this.getStatsForSingleType(typeId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats();
  }

  // Méthode pour un type de document spécifique
  private async getStatsForSingleType(typeId: number): Promise<SingleDocumentTypeStatsDto> {
    const typeDocument = await this.documentTypeRepository.findOne({
      where: { id: typeId },
      relations: [
        'customerTypes',
        'documents',
        'documents.dossier',
        'documents.dossier.client',
        'documents.uploaded_by'
      ]
    });

    if (!typeDocument) {
      throw new Error(`Type de document avec ID ${typeId} non trouvé`);
    }

    const maintenant = new Date();
    const sixMoisAvant = new Date();
    sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);

    return {
      typeDocument: {
        id: typeDocument.id,
        code: typeDocument.code,
        nom: typeDocument.name,
        description: typeDocument.description,
        dureeValidite: typeDocument.validityDuration,
        mimetype: typeDocument.mimetype,
        tailleMax: typeDocument.max_size,
        estRequis: typeDocument.isRequired,
        statut: typeDocument.status,
        dateCreation: typeDocument.created_at,
        dateMiseAJour: typeDocument.updated_at,
      },
      documents: this.getDocumentsStats(typeDocument.documents || []),
      typesClients: await this.getTypesClientsStats(typeDocument.customerTypes || []),
      parDossier: this.getDistributionByDossier(typeDocument.documents || []),
      parUploader: this.getDistributionByUploader(typeDocument.documents || []),
      evolution: this.getEvolutionStats(typeDocument.documents || []),
      conformite: await this.getConformiteStats(typeDocument),
    };
  }

  private getDocumentsStats(documents: any[]): SingleDocumentTypeStatsDto['documents'] {
    const total = documents.length;
    const totalSize = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);
    const tailleMoyenne = total > 0 ? totalSize / total : 0;

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    documents.forEach(d => {
      byStatusMap.set(d.status, (byStatusMap.get(d.status) || 0) + 1);
    });

    const statusLabels = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Refusé',
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };

    const statusColors = {
      [DocumentCustomerStatus.PENDING]: '#f59e0b',
      [DocumentCustomerStatus.ACCEPTED]: '#10b981',
      [DocumentCustomerStatus.REFUSED]: '#ef4444',
      [DocumentCustomerStatus.EXPIRED]: '#6b7280',
      [DocumentCustomerStatus.ARCHIVED]: '#9ca3af',
    };

    const parStatut = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: statusColors[status] || '#6b7280',
    }));

    // Documents récents
    const recents = [...documents]
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
      .slice(0, 10)
      .map(d => ({
        id: d.id,
        nom: d.name,
        dossier: d.dossier?.dossier_number,
        client: d.dossier?.client?.full_name,
        date: d.uploaded_at,
        taille: this.formatFileSize(d.file_size),
        statut: d.status,
      }));

    return {
      total,
      totalSize,
      totalSizeFormatted: this.formatFileSize(totalSize),
      tailleMoyenne: Math.round(tailleMoyenne),
      parStatut,
      recents,
    };
  }

  private async getTypesClientsStats(typesClients: any[]): Promise<SingleDocumentTypeStatsDto['typesClients']> {
    return typesClients.map(tc => ({
      id: tc.id,
      nom: tc.name,
      code: tc.code,
      clientsCount: tc.customers?.length || 0,
    }));
  }

  private getDistributionByDossier(documents: any[]): SingleDocumentTypeStatsDto['parDossier'] {
    const dossierMap = new Map<number, { dossierNumber: string; count: number }>();

    documents.forEach(d => {
      if (d.dossier) {
        const current = dossierMap.get(d.dossier.id) || {
          dossierNumber: d.dossier.dossier_number,
          count: 0
        };
        current.count++;
        dossierMap.set(d.dossier.id, current);
      }
    });

    const total = documents.length;
    const distribution = Array.from(dossierMap.entries())
      .map(([dossierId, data]) => ({
        dossierId,
        dossierNumber: data.dossierNumber,
        count: data.count,
        percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return distribution;
  }

  private getDistributionByUploader(documents: any[]): SingleDocumentTypeStatsDto['parUploader'] {
    const uploaderMap = new Map<number, { userName: string; count: number }>();

    documents.forEach(d => {
      if (d.uploaded_by) {
        const current = uploaderMap.get(d.uploaded_by.id) || {
          userName: d.uploaded_by.full_name,
          count: 0
        };
        current.count++;
        uploaderMap.set(d.uploaded_by.id, current);
      }
    });

    const total = documents.length;
    const distribution = Array.from(uploaderMap.entries())
      .map(([userId, data]) => ({
        userId,
        userName: data.userName,
        count: data.count,
        percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return distribution;
  }

  private getEvolutionStats(documents: any[]): SingleDocumentTypeStatsDto['evolution'] {
    const maintenant = new Date();
    const sixMoisAvant = new Date();
    sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);

    const evolutionMap = new Map<string, { count: number; totalSize: number }>();

    documents
      .filter(d => new Date(d.uploaded_at) >= sixMoisAvant)
      .forEach(d => {
        const date = new Date(d.uploaded_at);
        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const current = evolutionMap.get(mois) || { count: 0, totalSize: 0 };
        evolutionMap.set(mois, {
          count: current.count + 1,
          totalSize: current.totalSize + (d.file_size || 0),
        });
      });

    const evolution = Array.from(evolutionMap.entries())
      .map(([mois, data]) => ({
        mois,
        count: data.count,
        totalSize: data.totalSize,
      }))
      .sort((a, b) => a.mois.localeCompare(b.mois));

    return evolution;
  }

  private async getConformiteStats(typeDocument: DocumentType): Promise<SingleDocumentTypeStatsDto['conformite']> {
    // Récupérer tous les dossiers qui nécessitent ce type de document
    // Cette logique dépend de comment tu associes les types de documents aux dossiers
    // Exemple simplifié :
    
    const totalDocuments = typeDocument.documents?.length || 0;
    
    // Taux d'utilisation = nombre de documents de ce type / total des documents
    const tousDocuments = await this.documentTypeRepository
      .createQueryBuilder('dt')
      .leftJoin('dt.documents', 'doc')
      .select('COUNT(doc.id)', 'total')
      .getRawOne();
    
    const totalGlobalDocuments = parseInt(tousDocuments?.total || 0);
    const tauxUtilisation = totalGlobalDocuments > 0 
      ? Math.round((totalDocuments / totalGlobalDocuments) * 100) 
      : 0;

    // Ces métriques nécessitent une logique métier plus poussée
    return {
      tauxUtilisation,
      dossiersRequis: 0, // À implémenter selon ta logique
      dossiersAvecDocument: 0, // À implémenter selon ta logique
      tauxCouverture: 0, // À implémenter selon ta logique
    };
  }

  private formatFileSize(bytes?: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(): Promise<DocumentTypeStatsDto> {
    const [total, active, inactive, required, optional] = await Promise.all([
      this.getTotalCount(),
      this.getActiveCount(),
      this.getInactiveCount(),
      this.getRequiredCount(),
      this.getOptionalCount(),
    ]);

    const [byStatus, byCustomerType, topDocumentTypes, usageStats, mimeTypeStats] = await Promise.all([
      this.getStatsByStatus(),
      this.getStatsByCustomerType(),
      this.getTopDocumentTypes(),
      this.getUsageStats(),
      this.getMimeTypeStats(),
    ]);

    return {
      total,
      active,
      inactive,
      required,
      optional,
      byStatus,
      byCustomerType,
      topDocumentTypes,
      usageStats,
      mimeTypeStats,
    };
  }

  private async getTotalCount(): Promise<number> {
    return this.documentTypeRepository.count();
  }

  private async getActiveCount(): Promise<number> {
    return this.documentTypeRepository.count({ where: { status: 1 } });
  }

  private async getInactiveCount(): Promise<number> {
    return this.documentTypeRepository.count({ where: { status: 0 } });
  }

  private async getRequiredCount(): Promise<number> {
    return this.documentTypeRepository.count({ where: { isRequired: true } });
  }

  private async getOptionalCount(): Promise<number> {
    return this.documentTypeRepository.count({ where: { isRequired: false } });
  }

  private async getStatsByStatus(): Promise<DocumentTypeStatusStatsDto[]> {
    const documentTypes = await this.documentTypeRepository.find();
    const total = documentTypes.length;

    const statusCounts = {
      active: documentTypes.filter(d => d.status === 1).length,
      inactive: documentTypes.filter(d => d.status === 0).length,
    };

    const statusColors = {
      active: '#10b981',
      inactive: '#9ca3af',
    };

    const statusLabels = {
      active: 'Actif',
      inactive: 'Inactif',
    };

    return [
      {
        status: statusLabels.active,
        code: 1,
        count: statusCounts.active,
        percentage: total > 0 ? Math.round((statusCounts.active / total) * 100) : 0,
        color: statusColors.active,
      },
      {
        status: statusLabels.inactive,
        code: 0,
        count: statusCounts.inactive,
        percentage: total > 0 ? Math.round((statusCounts.inactive / total) * 100) : 0,
        color: statusColors.inactive,
      },
    ].filter(s => s.count > 0);
  }

  private async getStatsByCustomerType(): Promise<DocumentTypeCustomerTypeStatsDto[]> {
    const documentTypes = await this.documentTypeRepository.find({
      relations: ['customerTypes'],
    });

    const stats: DocumentTypeCustomerTypeStatsDto[] = [];

    documentTypes.forEach(docType => {
      if (docType.customerTypes && docType.customerTypes.length > 0) {
        docType.customerTypes.forEach(customerType => {
          stats.push({
            customerTypeId: customerType.id,
            customerTypeName: customerType.name,
            documentTypeId: docType.id,
            documentTypeName: docType.name,
            count: 1,
          });
        });
      }
    });

    const aggregated = stats.reduce((acc, curr) => {
      const key = `${curr.customerTypeId}-${curr.documentTypeId}`;
      if (!acc[key]) {
        acc[key] = { ...curr, count: 0 };
      }
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, DocumentTypeCustomerTypeStatsDto>);

    return Object.values(aggregated);
  }

  private async getTopDocumentTypes(): Promise<TopDocumentTypeDto[]> {
    const documentTypes = await this.documentTypeRepository
      .createQueryBuilder('dt')
      .leftJoinAndSelect('dt.documents', 'documents')
      .leftJoinAndSelect('dt.customerTypes', 'customerTypes')
      .select('dt.id', 'id')
      .addSelect('dt.code', 'code')
      .addSelect('dt.name', 'name')
      .addSelect('dt.isRequired', 'isRequired')
      .addSelect('dt.mimetype', 'mimeType')
      .addSelect('COUNT(DISTINCT documents.id)', 'documentsCount')
      .addSelect('COUNT(DISTINCT customerTypes.id)', 'customerTypesCount')
      .groupBy('dt.id')
      .orderBy('documentsCount', 'DESC')
      .limit(10)
      .getRawMany();

    return documentTypes.map(dt => ({
      id: dt.id,
      code: dt.code,
      name: dt.name,
      documentsCount: parseInt(dt.documentsCount || 0),
      isRequired: dt.isRequired === 1,
      mimeType: dt.mimeType,
      customerTypesCount: parseInt(dt.customerTypesCount || 0),
    }));
  }

  private async getUsageStats(): Promise<DocumentTypeUsageStatsDto> {
    const documentTypes = await this.documentTypeRepository.find({
      relations: ['documents'],
    });

    let totalDocuments = 0;
    const typeStats: Record<number, { count: number; name: string; code: string }> = {};

    documentTypes.forEach(type => {
      const docCount = type.documents?.length || 0;
      totalDocuments += docCount;

      typeStats[type.id] = {
        count: docCount,
        name: type.name,
        code: type.code,
      };
    });

    let mostUsedType = { id: 0, name: '', code: '', count: 0 };
    let leastUsedType = { id: 0, name: '', code: '', count: Infinity };

    Object.entries(typeStats).forEach(([id, stats]) => {
      if (stats.count > mostUsedType.count) {
        mostUsedType = { id: parseInt(id), ...stats };
      }
      if (stats.count < leastUsedType.count) {
        leastUsedType = { id: parseInt(id), ...stats };
      }
    });

    const requiredCount = documentTypes.filter(t => t.isRequired).length;
    const optionalCount = documentTypes.filter(t => !t.isRequired).length;

    return {
      totalDocuments,
      averagePerType: documentTypes.length > 0 ? Math.round((totalDocuments / documentTypes.length) * 100) / 100 : 0,
      mostUsedType,
      leastUsedType: leastUsedType.count === Infinity ? { id: 0, name: '', code: '', count: 0 } : leastUsedType,
      requiredDocumentsCount: requiredCount,
      optionalDocumentsCount: optionalCount,
    };
  }

  private async getMimeTypeStats(): Promise<MimeTypeStatsDto[]> {
    const documentTypes = await this.documentTypeRepository.find({
      relations: ['documents'],
    });

    const mimeTypeMap = new Map<string, { count: number; documents: number }>();

    documentTypes.forEach(type => {
      const mimeType = type.mimetype || 'non spécifié';
      const current = mimeTypeMap.get(mimeType) || { count: 0, documents: 0 };
      
      mimeTypeMap.set(mimeType, {
        count: current.count + 1,
        documents: current.documents + (type.documents?.length || 0),
      });
    });

    const total = documentTypes.length;
    const stats: MimeTypeStatsDto[] = [];

    mimeTypeMap.forEach((value, mimeType) => {
      stats.push({
        mimeType,
        count: value.count,
        percentage: total > 0 ? Math.round((value.count / total) * 100) : 0,
        documents: value.documents,
      });
    });

    return stats.sort((a, b) => b.count - a.count);
  }
}