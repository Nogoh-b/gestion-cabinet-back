// src/modules/findings/findings.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { DataSource, EntityManager, Repository, In } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { CreateFindingDto } from './dto/create-finding.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { FindingResponseDto } from './dto/response-finding.dto';
import { Finding, FindingStatus, FindingSeverity } from './entities/finding.entity';
import { DiligencesService } from '../diligence/diligence.service';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';

@Injectable()
export class FindingsService extends BaseServiceV1<Finding> {
  constructor(
    @InjectRepository(Finding)
    protected readonly repository: Repository<Finding>,
    protected readonly paginationService: PaginationServiceV1,
   @Inject(forwardRef(() => DiligencesService))
    private readonly diligencesService: DiligencesService,
    private readonly documentCustomerService: DocumentCustomerService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {
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
  async create(dto: CreateFindingDto, actorId: number): Promise<Finding> {
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
      if (
        Number((document as any).dossier_id) !==
        Number((diligence as any).dossier_id ?? (diligence as any).dossier?.id)
      ) {
        throw new BadRequestException(
          'Le document et la diligence doivent appartenir au même dossier',
        );
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
      created_by: { id: actorId },
      status: FindingStatus.IDENTIFIED,
    });

    const dossierId = Number(
      (diligence as any).dossier_id ?? (diligence as any).dossier?.id,
    );
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(finding);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'finding.created',
        resourceType: 'Finding',
        resourceId: saved.id,
        dossierId,
        afterState: this.auditState(saved),
      });
      await this.enqueueFindingEvent(
        manager,
        audit.id,
        'finding.created',
        saved,
        dossierId,
        actorId,
        { notifyClient: dto.notify_client === true },
      );
      return saved;
    });
  }

  /**
   * 📄 Récupération de tous les findings
   */
  async findAll(dossierIds?: number[]): Promise<Finding[]> {
    if (dossierIds && dossierIds.length === 0) return [];
    return this.repository.find({
      where: dossierIds
        ? { diligence: { dossier_id: In(dossierIds) } }
        : undefined,
      relations: [
        'diligence',
        'diligence.dossier',
        'document',
        'created_by',
        'validated_by',
      ],
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
      relations: [
        'diligence',
        'diligence.dossier',
        'document',
        'created_by',
        'validated_by',
      ],
    });

    if (!finding) {
      throw new NotFoundException(`Finding avec ID ${id} introuvable`);
    }

    return plainToInstance(FindingResponseDto, finding);
  }

  async getAccessScope(
    id: number,
  ): Promise<{ dossierId: number; confidentialityLevel: number }> {
    const finding = await this.repository.findOne({
      where: { id },
      relations: ['diligence', 'diligence.dossier'],
    });
    if (!finding?.diligence?.dossier_id) {
      throw new NotFoundException(`Finding avec ID ${id} introuvable`);
    }
    return {
      dossierId: finding.diligence.dossier_id,
      confidentialityLevel: 1,
    };
  }

  async getDiligenceAccessScope(
    diligenceId: number,
  ): Promise<{ dossierId: number; confidentialityLevel: number }> {
    return this.diligencesService.getAccessScope(diligenceId);
  }

  /**
   * ✏️ Mise à jour d'un finding
   */
  async update(
    id: number,
    dto: UpdateFindingDto,
    actorId: number,
  ): Promise<Finding> {
    const currentFinding = await this.repository.findOne({
      where: { id },
      relations: ['diligence', 'diligence.dossier', 'document'],
    });

    if (!currentFinding) {
      throw new NotFoundException(`Finding avec ID ${id} introuvable`);
    }

    let nextDocument: DocumentCustomer | null | undefined;
    if (
      dto.document_id !== undefined &&
      dto.document_id !== currentFinding.document?.id
    ) {
      if (dto.document_id) {
        const document = await this.documentCustomerService.findOne(dto.document_id);
        if (!document) {
          throw new NotFoundException(`Document avec ID ${dto.document_id} non trouvé`);
        }
        if (
          Number((document as any).dossier_id) !==
          Number(currentFinding.diligence.dossier_id)
        ) {
          throw new BadRequestException(
            'Le document et le constat doivent appartenir au même dossier',
          );
        }
        nextDocument = plainToInstance(DocumentCustomer, document);
      } else {
        nextDocument = null;
      }
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const finding = await manager.getRepository(Finding).findOne({
        where: { id },
        relations: ['diligence', 'document'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!finding) {
        throw new NotFoundException(`Finding avec ID ${id} introuvable`);
      }
      if (
        ![FindingStatus.IDENTIFIED, FindingStatus.IN_ANALYSIS].includes(
          finding.status,
        )
      ) {
        throw new BadRequestException(
          'Un constat validé ou traité ne peut plus être modifié',
        );
      }

      const beforeState = this.auditState(finding);
      Object.assign(finding, {
        title: dto.title ?? finding.title,
        description: dto.description ?? finding.description,
        severity: dto.severity ?? finding.severity,
        category: dto.category ?? finding.category,
        impact: dto.impact ?? finding.impact,
        recommendation: dto.recommendation ?? finding.recommendation,
        legal_basis: dto.legal_basis ?? finding.legal_basis,
        estimated_risk_amount:
          dto.estimated_risk_amount ?? finding.estimated_risk_amount,
        due_date: dto.due_date ? new Date(dto.due_date) : finding.due_date,
        confidential: dto.confidential ?? finding.confidential,
      });
      if (nextDocument !== undefined) {
        finding.document = nextDocument as any;
        finding.document_id = nextDocument?.id ?? null as any;
      }

      const saved = await manager.save(finding);
      const dossierId = saved.diligence.dossier_id;
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'finding.updated',
        resourceType: 'Finding',
        resourceId: saved.id,
        dossierId,
        beforeState,
        afterState: this.auditState(saved),
      });
      await this.enqueueFindingEvent(
        manager,
        audit.id,
        'finding.updated',
        saved,
        dossierId,
        actorId,
      );
      return saved;
    });
  }

  /**
   * ❌ Suppression d'un finding
   */
  async remove(id: number, actorId: number): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const finding = await manager.getRepository(Finding).findOne({
        where: { id },
        relations: ['diligence'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!finding) {
        throw new NotFoundException(`Finding avec ID ${id} introuvable`);
      }
      if (finding.status !== FindingStatus.IDENTIFIED) {
        throw new BadRequestException(
          'Seul un constat identifié non traité peut être supprimé',
        );
      }

      const dossierId = finding.diligence.dossier_id;
      const beforeState = this.auditState(finding);
      await manager.remove(finding);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'finding.deleted',
        resourceType: 'Finding',
        resourceId: id,
        dossierId,
        beforeState,
      });
      await this.enqueueFindingEvent(
        manager,
        audit.id,
        'finding.deleted',
        finding,
        dossierId,
        actorId,
      );
    });
  }

  /**
   * 🔎 Démarrer l'analyse d'un constat
   */
  async startAnalysis(id: number, actorId: number): Promise<Finding> {
    return this.transition(
      id,
      actorId,
      'finding.analysis_started',
      (finding) => {
        if (finding.status !== FindingStatus.IDENTIFIED) {
          throw new BadRequestException(
            'Seul un constat identifié peut passer en analyse',
          );
        }
        finding.status = FindingStatus.IN_ANALYSIS;
      },
    );
  }

  /**
   * ✅ Valider un finding
   */
  async validate(id: number, userId: number): Promise<Finding> {
    return this.transition(
      id,
      userId,
      'finding.validated',
      (finding) => {
        if (
          ![FindingStatus.IDENTIFIED, FindingStatus.IN_ANALYSIS].includes(
            finding.status,
          )
        ) {
          throw new BadRequestException(
            'Seul un constat identifié ou en analyse peut être validé',
          );
        }
        finding.validate(userId);
      },
    );
  }

  /**
   * 🔄 Marquer un finding comme résolu
   */
  async resolve(id: number, actorId: number): Promise<Finding> {
    return this.transition(
      id,
      actorId,
      'finding.resolved',
      (finding) => {
        if (finding.status !== FindingStatus.VALIDATED) {
          throw new BadRequestException(
            'Seul un constat validé peut être marqué comme résolu',
          );
        }
        finding.resolve();
      },
    );
  }

  /**
   * 🤝 Accepter un risque (waive)
   */
  async waive(
    id: number,
    comment: string | undefined,
    actorId: number,
  ): Promise<Finding> {
    if (!comment?.trim() || comment.trim().length < 10) {
      throw new BadRequestException(
        'Une justification d’au moins 10 caractères est obligatoire',
      );
    }
    const justification = comment.trim();
    return this.transition(
      id,
      actorId,
      'finding.waived',
      (finding) => {
        if (finding.status !== FindingStatus.VALIDATED) {
          throw new BadRequestException(
            'Seul un constat validé peut faire l’objet d’une acceptation de risque',
          );
        }
        finding.waive(justification);
      },
      justification,
    );
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
  async getStatsBySeverity(
    diligenceId?: number,
    dossierIds?: number[],
  ): Promise<any> {
    const queryBuilder = this.repository
      .createQueryBuilder('finding')
      .leftJoin('finding.diligence', 'diligence')
      .select('finding.severity', 'severity')
      .addSelect('COUNT(finding.id)', 'count');

    if (diligenceId) {
      queryBuilder.where('finding.diligence_id = :diligenceId', { diligenceId });
    }
    if (dossierIds) {
      if (dossierIds.length === 0) {
        queryBuilder.andWhere('1 = 0');
      } else {
        queryBuilder.andWhere(
          'diligence.dossier_id IN (:...accessibleDossierIds)',
          { accessibleDossierIds: dossierIds },
        );
      }
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

  private transition(
    id: number,
    actorId: number,
    action: string,
    mutate: (finding: Finding) => void,
    justification?: string,
  ): Promise<Finding> {
    return this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager: EntityManager) => {
        const finding = await manager.getRepository(Finding).findOne({
          where: { id },
          relations: ['diligence'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!finding) {
          throw new NotFoundException(`Finding avec ID ${id} introuvable`);
        }

        const beforeState = this.auditState(finding);
        mutate(finding);
        const saved = await manager.save(finding);
        const dossierId = saved.diligence.dossier_id;
        const audit = await this.auditService.append(manager, {
          actorId,
          action,
          resourceType: 'Finding',
          resourceId: saved.id,
          dossierId,
          beforeState,
          afterState: this.auditState(saved),
          justification,
        });
        await this.enqueueFindingEvent(
          manager,
          audit.id,
          action,
          saved,
          dossierId,
          actorId,
          justification ? { justification } : undefined,
        );
        return saved;
      },
    );
  }

  private enqueueFindingEvent(
    manager: EntityManager,
    auditId: string,
    eventType: string,
    finding: Finding,
    dossierId: number,
    actorId: number,
    extraPayload: Record<string, any> = {},
  ) {
    return this.outboxService.enqueue(manager, {
      eventType,
      aggregateType: 'Finding',
      aggregateId: finding.id,
      idempotencyKey: `${eventType}:${auditId}`,
      payload: {
        findingId: finding.id,
        diligenceId: finding.diligence_id,
        dossierId,
        actorId,
        status: finding.status,
        severity: finding.severity,
        ...extraPayload,
      },
    });
  }

  private auditState(finding: Finding): Record<string, any> {
    return {
      status: finding.status,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      documentId: finding.document_id ?? null,
      dueDate: finding.due_date ?? null,
      confidential: finding.confidential === true,
      validatedById: finding.validated_by_id ?? null,
      validatedAt: finding.validated_at ?? null,
      resolvedAt: finding.resolved_at ?? null,
    };
  }
}
