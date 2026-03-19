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

@Injectable()
export class DocumentTypeStatsService {
  constructor(
    @InjectRepository(DocumentType)
    private documentTypeRepository: Repository<DocumentType>,
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
  ) {}

  async getStats(): Promise<DocumentTypeStatsDto> {
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
      active: '#10b981', // vert
      inactive: '#9ca3af', // gris
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

    // Agréger par couple (type client, type document)
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

    // Trouver le type le plus utilisé et le moins utilisé
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