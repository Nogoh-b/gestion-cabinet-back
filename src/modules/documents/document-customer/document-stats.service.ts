// src/modules/documents/document-customer/services/document-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseStatsService } from 'src/core/shared/services/stats/base-v1.service';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { DocumentCustomer, DocumentCustomerStatus } from './entities/document-customer.entity';
import { DocumentStatsDto } from './dto/document-stats.dto';
import { SingleDocumentStatsDto } from './dto/single-document-stats.dto';
import { ProcedureInstanceService } from 'src/modules/procedure/services/procedure-instance.service';
import { DossiersService } from 'src/modules/dossiers/dossiers.service';

@Injectable()
export class DocumentStatsService extends BaseStatsService<DocumentCustomer> {
  constructor(
    @InjectRepository(DocumentCustomer)
    private documentRepository: Repository<DocumentCustomer>,
    private procedureInstanceService: ProcedureInstanceService,
    private dossierservice: DossiersService,
  ) {
    super(documentRepository);
  }

  async getStats(filters?: StatsFilterDto): Promise<DocumentStatsDto | SingleDocumentStatsDto> {
    // Si un documentId est fourni, on retourne les stats détaillées de ce document
    if (filters?.documentId) {
      return this.getStatsForSingleDocument(filters.documentId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  // Méthode pour un document spécifique
  private async getStatsForSingleDocument(documentId: number): Promise<SingleDocumentStatsDto> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: [
        'document_type',
        'category',
        'dossier',
        'dossier.client',
        'dossier.lawyer',
        'dossier.lawyer.user',
        'customer',
        'uploaded_by',
        'previous_version',
        'audiences',
        'audiences.jurisdiction',
        'diligences',
        'findings',
        'subStages'
      ]
    });

    if (!document) {
      throw new Error(`Document avec ID ${documentId} non trouvé`);
    }

    // Récupérer les versions précédentes
    const versionsPrecedentes = await this.documentRepository.find({
      where: { previous_version: { id: documentId } },
      relations: ['uploaded_by'],
      order: { version: 'DESC' }
    });

    const statusLabels = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Refusé',
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };

    return {
      document: {
        id: document.id,
        nom: document.name,
        description: document.description,
        type: document.document_type?.name || 'Non spécifié',
        categorie: document.category?.name || 'Non catégorisé',
        statut: document.status,
        statutLabel: statusLabels[document.status] || 'Inconnu',
        version: document.version,
        estVersionCourante: document.is_current_version,
        dateUpload: document.uploaded_at,
        dateModification: document.last_modified,
        dateValidation: document.date_validation,
        dateExpiration: document.date_expired,
      },
      fichier: {
        chemin: document.file_path,
        url: document.file_url,
        taille: document.file_size || 0,
        tailleFormatee: this.formatFileSize(document.file_size),
        mimetype: document.file_mimetype,
        extension: this.getFileExtension(document.file_mimetype, document.name) || 'N/A',
      },
      // dossier: document.dossier ? {
      //   id: document.dossier.id,
      //   numero: document.dossier.dossier_number,
      //   objet: document.dossier.object,
      //   client: document.dossier.client?.full_name,
      //   avocat: document.dossier.lawyer?.full_name,
      // } : null,
      // client: document.customer ? {
      //   id: document.customer.id,
      //   nom: document.customer.full_name,
      //   email: document.customer.email,
      //   telephone: document.customer.number_phone_1 || document.customer.professional_phone,
      // } : null,
      // uploader: document.uploaded_by ? {
      //   id: document.uploaded_by.id,
      //   nom: document.uploaded_by.full_name,
      //   email: document.uploaded_by.email,
      //   dateUpload: document.uploaded_at,
      // } : null,
      metadonnees: document.metadata ? {
        motsCles: document.metadata.keywords,
        nombrePages: document.metadata.page_count,
        langue: document.metadata.language,
        nomOriginal: document.metadata.original_filename,
      } : {},
      versionsPrecedentes: versionsPrecedentes.map(v => ({
        id: v.id,
        version: v.version,
        dateUpload: v.uploaded_at,
        uploader: v.uploaded_by?.full_name || 'Inconnu',
        taille: this.formatFileSize(v.file_size),
      })),
      audiences: (document.audiences || []).map(a => ({
        id: a.id,
        titre: 'N/A',
        date: a.full_datetime,
        jurisdiction: a.jurisdiction?.name,
      })),
      diligences: (document.diligences || []).map(d => ({
        id: d.id,
        titre: d.title,
        statut: d.status,
        deadline: d.deadline,
      })),
      historique: this.buildHistory(document),
    };
  }

  private getFileExtension(mimetype: string, filename: string): string | undefined {
    if (filename && filename.includes('.')) {
      return filename.split('.').pop();
    }
    
    const extensionMap = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/plain': 'txt',
      'application/zip': 'zip',
    };
    
    return extensionMap[mimetype] || 'bin';
  }

  private buildHistory(document: any): SingleDocumentStatsDto['historique'] {
    const history : any = [];

    // Upload
    history.push({
      action: 'Upload',
      utilisateur: document.uploaded_by?.full_name || 'Système',
      date: document.uploaded_at,
    });

    // Validation/Rejet
    if (document.date_validation) {
      history.push({
        action: document.status === DocumentCustomerStatus.ACCEPTED ? 'Validation' : 'Rejet',
        utilisateur: 'Système', // À remplacer par l'utilisateur qui a validé
        date: document.date_validation,
        details: document.status === DocumentCustomerStatus.ACCEPTED ? 'Document validé' : 'Document rejeté',
      });
    }

    // Expiration
    if (document.date_expired) {
      history.push({
        action: 'Expiration',
        utilisateur: 'Système',
        date: document.date_expired,
        details: 'Document expiré',
      });
    }

    // Modifications
    if (document.last_modified && document.last_modified > document.uploaded_at) {
      history.push({
        action: 'Modification',
        utilisateur: 'Système',
        date: document.last_modified,
        details: 'Document modifié',
      });
    }

    // Audit trail from metadata
    if (document.metadata?.audit_trail) {
      document.metadata.audit_trail.forEach((entry: any) => {
        history.push({
          action: entry.action,
          utilisateur: `Utilisateur ${entry.user_id}`,
          date: entry.timestamp,
          details: entry.details,
        });
      });
    }

    // Trier par date (plus récent d'abord)
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(filters?: StatsFilterDto): Promise<DocumentStatsDto> {
    const [
      total,
      totalSize,
      averageSize,
      pendingValidation,
      validated,
      rejected,
      expired,
      byType,
      byCategory,
      byStatus,
      byMimeType,
      byDossier,
      byUploader,
      evolution,
      storageStats,
      recentDocuments,
      pendingDocuments,
      uploadTrend,
    ] = await Promise.all([
      this.getTotalCount(filters),
      this.getTotalSize(filters),
      this.getAverageSize(filters),
      this.getPendingCount(filters),
      this.getValidatedCount(filters),
      this.getRejectedCount(filters),
      this.getExpiredCount(filters),
      this.getDistributionByType(filters),
      this.getDistributionByCategory(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByMimeType(filters),
      this.getDistributionByDossier(filters),
      this.getDistributionByUploader(filters),
      this.getEvolution(filters),
      this.getStorageStats(filters),
      this.getRecentDocuments(filters),
      this.getPendingDocuments(filters),
      this.getUploadTrend(filters),
    ]);

    return {
      total,
      totalSize,
      averageSize,
      pendingValidation,
      validated,
      rejected,
      expired,
      byType,
      byCategory,
      byStatus,
      byMimeType,
      byDossier,
      byUploader,
      evolution,
      storageStats,
      recentDocuments,
      pendingDocuments,
      uploadTrend,
    };
  }

  private async getTotalSize(filters?: StatsFilterDto): Promise<number> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .select('SUM(document.file_size)', 'total');
    this.applyFilters(query, filters, 'document');
    const result = await query.getRawOne();
    return parseFloat(result.total || 0);
  }

  private async getAverageSize(filters?: StatsFilterDto): Promise<number> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .select('AVG(document.file_size)', 'avg');
    this.applyFilters(query, filters, 'document');
    const result = await query.getRawOne();
    return Math.round(parseFloat(result.avg || 0));
  }

  private async getPendingCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .where('document.status = :status', { status: DocumentCustomerStatus.PENDING });
    this.applyFilters(query, filters, 'document');
    return query.getCount();
  }

  private async getValidatedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .where('document.status = :status', { status: DocumentCustomerStatus.ACCEPTED });
    this.applyFilters(query, filters, 'document');
    return query.getCount();
  }

  private async getRejectedCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .where('document.status = :status', { status: DocumentCustomerStatus.REFUSED });
    this.applyFilters(query, filters, 'document');
    return query.getCount();
  }

  private async getExpiredCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .where('document.status = :status', { status: DocumentCustomerStatus.EXPIRED });
    this.applyFilters(query, filters, 'document');
    return query.getCount();
  }

  private async getDistributionByType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoin('document.document_type', 'type')
      .select('type.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('type.id IS NOT NULL')
      .groupBy('type.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Non spécifié',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByCategory(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoin('document.category', 'category')
      .select('category.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('category.id IS NOT NULL')
      .groupBy('category.name')
      .orderBy('count', 'DESC');

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Non catégorisé',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByStatus(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .select('document.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('document.status');

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

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

    return results.map(r => ({
      name: statusLabels[r.status] || 'Inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      color: statusColors[r.status],
      id: r.status,
    }));
  }

  private async getDistributionByMimeType(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .select('document.file_mimetype', 'mimeType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(document.file_size)', 'totalSize')
      .where('document.file_mimetype IS NOT NULL')
      .groupBy('document.file_mimetype')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const mimeTypeLabels = {
      'application/pdf': 'PDF',
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
      'application/msword': 'Word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
      'application/vnd.ms-excel': 'Excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
      'text/plain': 'Texte',
    };

    return results.map(r => ({
      name: mimeTypeLabels[r.mimeType] || r.mimeType,
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      totalSize: parseFloat(r.totalSize || 0),
    }));
  }

  private async getDistributionByDossier(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoin('document.dossier', 'dossier')
      .select('dossier.dossier_number', 'dossierNumber')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.id IS NOT NULL')
      .groupBy('dossier.dossier_number')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.dossierNumber || 'Dossier inconnu',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
    }));
  }

  private async getDistributionByUploader(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoin('document.uploaded_by', 'user')
      .select('user.id', 'userId')
      .addSelect("CONCAT(user.first_name, ' ', user.last_name)", 'userName')
      .addSelect('COUNT(*)', 'count')
      .where('user.id IS NOT NULL')
      .groupBy('user.id, user.first_name, user.last_name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.userName || 'Utilisateur',
      value: parseInt(r.count),
      percentage: this.calculatePercentage(parseInt(r.count), total),
      id: r.userId,
    }));
  }

  private async getStorageStats(filters?: StatsFilterDto): Promise<any> {
    const totalSize = await this.getTotalSize(filters);
    
    const largestQuery = this.documentRepository
      .createQueryBuilder('document')
      .leftJoin('document.dossier', 'dossier')
      .select([
        'document.id',
        'document.name',
        'document.file_size',
        'dossier.dossier_number',
      ])
      .orderBy('document.file_size', 'DESC')
      .limit(1);

    this.applyFilters(largestQuery, filters, 'document');

    const largest = await largestQuery.getOne();

    const byMimeTypeQuery = this.documentRepository
      .createQueryBuilder('document')
      .select('document.file_mimetype', 'mimeType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(document.file_size)', 'totalSize')
      .where('document.file_mimetype IS NOT NULL')
      .groupBy('document.file_mimetype')
      .orderBy('totalSize', 'DESC')
      .limit(5);

    this.applyFilters(byMimeTypeQuery, filters, 'document');

    const byMimeType = await byMimeTypeQuery.getRawMany();
    const totalMimeSize = byMimeType.reduce((sum, r) => sum + parseFloat(r.totalSize || 0), 0);

    return {
      totalSize,
      totalSizeFormatted: this.formatFileSize(totalSize),
      averageSize: await this.getAverageSize(filters),
      largestDocument: largest ? {
        id: largest.id,
        name: largest.name,
        size: largest.file_size,
        sizeFormatted: this.formatFileSize(largest.file_size),
        dossierNumber: largest.dossier?.dossier_number,
      } : null,
      byMimeType: byMimeType.map(r => ({
        mimeType: r.mimeType,
        count: parseInt(r.count),
        totalSize: parseFloat(r.totalSize || 0),
        totalSizeFormatted: this.formatFileSize(parseFloat(r.totalSize || 0)),
        percentage: totalMimeSize > 0 ? Math.round((parseFloat(r.totalSize || 0) / totalMimeSize) * 100) : 0,
      })),
    };
  }

  private async getRecentDocuments(filters?: StatsFilterDto): Promise<any[]> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.dossier', 'dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('document.document_type', 'type')
      .leftJoinAndSelect('document.category', 'category')
      .leftJoinAndSelect('document.uploaded_by', 'user')
      .orderBy('document.uploaded_at', 'DESC')
      .limit(20);

    this.applyFilters(query, filters, 'document');

    const results = await query.getMany();

    return results.map(d => ({
      id: d.id,
      name: d.name,
      dossierNumber: d.dossier?.dossier_number,
      clientName: d.dossier?.client?.full_name,
      type: d.document_type?.name,
      category: d.category?.name,
      status: d.status,
      size: d.file_size,
      sizeFormatted: this.formatFileSize(d.file_size),
      uploadedBy: d.uploaded_by?.full_name,
      uploadedAt: d.uploaded_at,
    }));
  }

  private async getPendingDocuments(filters?: StatsFilterDto): Promise<any[]> {
    const now = new Date();

    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.dossier', 'dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('document.document_type', 'type')
      .leftJoinAndSelect('document.uploaded_by', 'user')
      .where('document.status = :status', { status: DocumentCustomerStatus.PENDING })
      .orderBy('document.uploaded_at', 'ASC')
      .limit(20);

    this.applyFilters(query, filters, 'document');

    const results = await query.getMany();

    return results.map(d => ({
      id: d.id,
      name: d.name,
      dossierNumber: d.dossier?.dossier_number,
      clientName: d.dossier?.client?.full_name,
      type: d.document_type?.name,
      uploadedBy: d.uploaded_by?.full_name,
      uploadedAt: d.uploaded_at,
      daysPending: Math.ceil((now.getTime() - d.uploaded_at.getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }

  private async getUploadTrend(filters?: StatsFilterDto): Promise<any[]> {
    const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};

    const query = this.documentRepository
      .createQueryBuilder('document')
      .select("DATE_FORMAT(document.uploaded_at, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(document.file_size)', 'totalSize')
      .where('document.uploaded_at BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(document.uploaded_at, '%Y-%m-%d')")
      .orderBy('date', 'ASC');

    this.applyFilters(query, filters, 'document');

    const results = await query.getRawMany();

    return results.map(r => ({
      date: r.date,
      count: parseInt(r.count),
      totalSize: parseFloat(r.totalSize || 0),
    }));
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

  async linkDocumentsToSubStage(
  documentIds: number[],
  subStageId: string
): Promise<void> {
  if (!documentIds || documentIds.length === 0) {
    throw new Error('Aucun document fourni');
  }

  // Vérifier que le subStage existe
  // const subStage = await this.subStageRepository.findOne({
  //   where: { id: subStageId },
  // });

  // if (!subStage) {
  //   throw new Error(`SubStage ${subStageId} non trouvé`);
  // }

  // 🔗 Ajout en masse (table pivot)
  await this.documentRepository
    .createQueryBuilder()
    .relation('subStages')
    .of(documentIds) // 👈 tableau ici
    .add(subStageId);
}

async validatefile(documentId: number, validatorId: number): Promise<void> {
  const document = await this.documentRepository.findOne({
    where: { id: documentId },
    relations: ['uploaded_by'],
  });
  if (!document) {
    throw new Error(`Document avec ID ${documentId} non trouvé`);
  }
  document.status = DocumentCustomerStatus.ACCEPTED;
  document.date_validation = new Date();
  await this.documentRepository.save(document);
}



}