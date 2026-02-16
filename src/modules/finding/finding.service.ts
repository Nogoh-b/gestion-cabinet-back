// src/modules/findings/findings.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { Repository, In } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { CreateFindingDto } from './dto/create-finding.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { FindingResponseDto } from './dto/response-finding.dto';
import { Finding, FindingStatus, FindingSeverity } from './entities/finding.entity';
import { DiligencesService } from '../diligence/diligence.service';
import { UsersService } from '../iam/user/user.service';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { User } from '../iam/user/entities/user.entity';

@Injectable()
export class FindingsService extends BaseServiceV1<Finding> {
  constructor(
    @InjectRepository(Finding)
    protected readonly repository: Repository<Finding>,
    protected readonly paginationService: PaginationServiceV1,
   @Inject(forwardRef(() => DiligencesService))
    private readonly diligencesService: DiligencesService,
    private readonly usersService: UsersService,
    private readonly documentCustomerService: DocumentCustomerService,
  ) {
    console.log(forwardRef)
    super(repository, paginationService);
  }

  /**
   * 🔍 Configuration de la recherche par défaut
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['title', 'description', 'impact', 'recommendation', 'legal_basis'],
      exactMatchFields: ['severity', 'status', 'category', 'diligence_id', 'created_by_id'],
      dateRangeFields: ['due_date', 'validated_at', 'resolved_at', 'created_at'],
      relationFields: ['diligence', 'document', 'created_by', 'validated_by'],
    };
  }

  /**
   * ➕ Création d'un finding
   */
  async create(dto: CreateFindingDto): Promise<Finding> {
    // Vérifier que la diligence existe
    const diligence = await this.diligencesService.findOne(dto.diligence_id);
    if (!diligence) {
      throw new NotFoundException(`Diligence avec ID ${dto.diligence_id} non trouvée`);
    }

    // Vérifier que le document existe (si fourni)
    if (dto.document_id) {
      const document = await this.documentCustomerService.findOne(dto.document_id);
      if (!document) {
        throw new NotFoundException(`Document avec ID ${dto.document_id} non trouvé`);
      }
    }

    // Vérifier que l'utilisateur créateur existe (si fourni)
    if (dto.created_by_id) {
      const user = await this.usersService.findOne(dto.created_by_id);
      if (!user) {
        throw new NotFoundException(`Utilisateur avec ID ${dto.created_by_id} non trouvé`);
      }
    }

    // Création de l'entité
    const finding = this.repository.create({
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      category: dto.category,
      impact: dto.impact,
      recommendation: dto.recommendation,
      legal_basis: dto.legal_basis,
      estimated_risk_amount: dto.estimated_risk_amount,
      due_date: dto.due_date ? new Date(dto.due_date) : undefined,
      confidential: dto.confidential ?? false,
      diligence: { id: dto.diligence_id },
      document: dto.document_id ? { id: dto.document_id } : undefined,
      created_by: dto.created_by_id ? { id: dto.created_by_id } : undefined,
      status: FindingStatus.IDENTIFIED,
    });

    return await this.repository.save(finding);
  }

  /**
   * 📄 Récupération de tous les findings
   */
  async findAll(): Promise<Finding[]> {
    return this.repository.find({
      relations: ['diligence', 'document', 'created_by', 'validated_by'],
      order: { 
        severity: 'DESC',
        created_at: 'DESC' 
      },
    });
  }

  /**
   * 🔎 Trouver un finding par ID
   */
  async findOne(id: number): Promise<FindingResponseDto | any> {
    const finding = await this.repository.findOne({
      where: { id },
      relations: ['diligence', 'document', 'created_by', 'validated_by'],
    });

    if (!finding) {
      throw new NotFoundException(`Finding avec ID ${id} introuvable`);
    }

    return plainToInstance(FindingResponseDto, finding);
  }

  /**
   * ✏️ Mise à jour d'un finding
   */
  async update(id: number, dto: UpdateFindingDto): Promise<Finding> {
    const finding = await this.repository.findOne({
      where: { id },
      relations: ['diligence', 'document'],
    });

    if (!finding) {
      throw new NotFoundException(`Finding avec ID ${id} introuvable`);
    }

    // Vérifications des relations si modifiées
    if (dto.diligence_id && dto.diligence_id !== finding.diligence?.id) {
      const diligence = await this.diligencesService.findOne(dto.diligence_id);
      if (!diligence) {
        throw new NotFoundException(`Diligence avec ID ${dto.diligence_id} non trouvée`);
      }
      finding.diligence = diligence;
    }

    if (dto.document_id !== undefined && dto.document_id !== finding.document?.id) {
      if (dto.document_id) {
        const document = await this.documentCustomerService.findOne(dto.document_id);
        if (!document) {
          throw new NotFoundException(`Document avec ID ${dto.document_id} non trouvé`);
        }
        finding.document = plainToInstance(DocumentCustomer, document);
      } else {
        finding.document = null as any;
      }
    }

    if (dto.created_by_id && dto.created_by_id !== finding.created_by?.id) {
      if (dto.created_by_id) {
        const user = await this.usersService.findOne(dto.created_by_id);
        if (!user) {
          throw new NotFoundException(`Utilisateur avec ID ${dto.created_by_id} non trouvé`);
        }
        finding.created_by =plainToInstance(User, user);
      } else {
        finding.created_by = null as any;
      }
    }

    // Mise à jour des champs simples
    Object.assign(finding, {
      title: dto.title ?? finding.title,
      description: dto.description ?? finding.description,
      severity: dto.severity ?? finding.severity,
      category: dto.category ?? finding.category,
      impact: dto.impact ?? finding.impact,
      recommendation: dto.recommendation ?? finding.recommendation,
      legal_basis: dto.legal_basis ?? finding.legal_basis,
      estimated_risk_amount: dto.estimated_risk_amount ?? finding.estimated_risk_amount,
      due_date: dto.due_date ? new Date(dto.due_date) : finding.due_date,
      confidential: dto.confidential ?? finding.confidential,
    });

    return this.repository.save(finding);
  }

  /**
   * ❌ Suppression d'un finding
   */
  async remove(id: number): Promise<void> {
    const finding = await this.findOne(id);
    await this.repository.remove(plainToInstance(Finding, finding));
  }

  /**
   * 🔄 Supprimer plusieurs findings
   */
  async removeMany(ids: number[]): Promise<void> {
    await this.repository.delete({ id: In(ids) });
  }

  /**
   * ✅ Valider un finding
   */
  async validate(id: number, userId: number): Promise<Finding> {
    const finding = await this.findOne(id);
    const findingEntity = plainToInstance(Finding, finding);
    
    // Vérifier que l'utilisateur existe
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(`Utilisateur avec ID ${userId} non trouvé`);
    }

    findingEntity.validate(userId);
    return this.repository.save(findingEntity);
  }

  /**
   * 🔄 Marquer un finding comme résolu
   */
  async resolve(id: number): Promise<Finding> {
    const finding = await this.findOne(id);
    const findingEntity = plainToInstance(Finding, finding);
    
    if (findingEntity.status === FindingStatus.RESOLVED) {
      throw new BadRequestException('Ce finding est déjà résolu');
    }

    findingEntity.resolve();
    return this.repository.save(findingEntity);
  }

  /**
   * 🤝 Accepter un risque (waive)
   */
  async waive(id: number, comment?: string): Promise<Finding> {
    const finding = await this.findOne(id);
    const findingEntity = plainToInstance(Finding, finding);
    
    findingEntity.waive(comment);
    return this.repository.save(findingEntity);
  }

  /**
   * 📋 Récupérer tous les findings d'une diligence
   */
  async findByDiligence(diligenceId: number): Promise<Finding[]> {
    return this.repository.find({
      where: { diligence: { id: diligenceId } },
      relations: ['document', 'created_by'],
      order: {
        severity: 'DESC',
        created_at: 'DESC',
      },
    });
  }

  /**
   * 📊 Statistiques par sévérité
   */
  async getStatsBySeverity(diligenceId?: number): Promise<any> {
    const queryBuilder = this.repository
      .createQueryBuilder('finding')
      .select('finding.severity', 'severity')
      .addSelect('COUNT(finding.id)', 'count');

    if (diligenceId) {
      queryBuilder.where('finding.diligence_id = :diligenceId', { diligenceId });
    }

    const result = await queryBuilder
      .groupBy('finding.severity')
      .getRawMany();

    return result;
  }

  /**
   * 📊 Statistiques par statut
   */
  async getStatsByStatus(diligenceId?: number): Promise<any> {
    const queryBuilder = this.repository
      .createQueryBuilder('finding')
      .select('finding.status', 'status')
      .addSelect('COUNT(finding.id)', 'count');

    if (diligenceId) {
      queryBuilder.where('finding.diligence_id = :diligenceId', { diligenceId });
    }

    const result = await queryBuilder
      .groupBy('finding.status')
      .getRawMany();

    return result;
  }

  /**
   * 📊 Statistiques par catégorie
   */
  async getStatsByCategory(diligenceId?: number): Promise<any> {
    const queryBuilder = this.repository
      .createQueryBuilder('finding')
      .select('finding.category', 'category')
      .addSelect('COUNT(finding.id)', 'count');

    if (diligenceId) {
      queryBuilder.where('finding.diligence_id = :diligenceId', { diligenceId });
    }

    const result = await queryBuilder
      .groupBy('finding.category')
      .getRawMany();

    return result;
  }

  /**
   * 📈 Obtenir un résumé complet pour une diligence
   */
  async getDiligenceSummary(diligenceId: number): Promise<any> {
    const findings = await this.findByDiligence(diligenceId);
    
    const summary = {
      total: findings.length,
      bySeverity: {
        critical: findings.filter(f => f.severity === FindingSeverity.CRITICAL).length,
        high: findings.filter(f => f.severity === FindingSeverity.HIGH).length,
        medium: findings.filter(f => f.severity === FindingSeverity.MEDIUM).length,
        low: findings.filter(f => f.severity === FindingSeverity.LOW).length,
        info: findings.filter(f => f.severity === FindingSeverity.INFO).length,
      },
      byStatus: {
        identified: findings.filter(f => f.status === FindingStatus.IDENTIFIED).length,
        in_analysis: findings.filter(f => f.status === FindingStatus.IN_ANALYSIS).length,
        validated: findings.filter(f => f.status === FindingStatus.VALIDATED).length,
        resolved: findings.filter(f => f.status === FindingStatus.RESOLVED).length,
        waived: findings.filter(f => f.status === FindingStatus.WAIVED).length,
      },
      totalRiskAmount: findings
        .filter(f => f.estimated_risk_amount)
        .reduce((sum, f) => sum + (f.estimated_risk_amount || 0), 0),
      criticalFindings: findings
        .filter(f => f.severity === FindingSeverity.CRITICAL && f.status !== FindingStatus.RESOLVED)
        .map(f => ({
          id: f.id,
          title: f.title,
          due_date: f.due_date,
        })),
    };

    return summary;
  }
}