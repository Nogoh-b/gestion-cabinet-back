// src/modules/diligences/diligences.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import {
  DataSource,
  EntityManager,
  LessThan,
  MoreThan,
  Repository,
  In,
} from 'typeorm';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';




import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { DossiersService } from '../dossiers/dossiers.service';
import { User } from '../iam/user/entities/user.entity';
import { UsersService } from '../iam/user/user.service';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { StageVisit } from '../procedure/entities/stage-visit.entity';
import { SubStageVisit } from '../procedure/entities/sub-stage-visit.entity';
import { DossierMember } from '../dossiers/entities/dossier-member.entity';
import { CreateDiligenceDto } from './dto/create-diligence.dto';
import { DiligenceResponseDto } from './dto/response-diligence.dto';
import { UpdateDiligenceDto } from './dto/update-diligence.dto';
import { Diligence, DiligenceStatus, DiligencePriority } from './entities/diligence.entity';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';







@Injectable()
export class DiligencesService extends BaseServiceV1<Diligence> {
  constructor(
    @InjectRepository(Diligence)
    protected readonly repository: Repository<Diligence>,
    protected readonly paginationService: PaginationServiceV1,
    @Inject(forwardRef(() => DossiersService))
    private readonly dossierService: DossiersService,
    private readonly usersService: UsersService,
    private readonly documentCustomerService: DocumentCustomerService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    // @Inject(forwardRef(() => StepsService))
    // private stepsService: StepsService,
    
  ) {
    super(repository, paginationService);
  }

  /**
   * 🔍 Configuration de la recherche par défaut
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['title', 'description', 'scope', 'findings_summary', 'recommendations'],
      exactMatchFields: ['status', 'type', 'priority', 'dossier_id', 'assigned_lawyer_id'],
      dateRangeFields: ['start_date', 'deadline', 'completion_date', 'created_at'],
      relationFields: ['dossier', 'dossier.client', 'assigned_lawyer', 'findings', 'documents','subStage'],
    };
  }

  /**
   * ➕ Création d'une diligence
   */
  async create(
    dto: CreateDiligenceDto,
    actorId: number,
  ): Promise<DiligenceResponseDto> {
    // Vérifier que le dossier existe
    const dossier = await this.dossierService.findOne(dto.dossier_id);
    if (!dossier) {
      throw new NotFoundException(`Dossier avec ID ${dto.dossier_id} non trouvé`);
    }

    // Vérifier que l'avocat assigné existe (si fourni)
    if (dto.assigned_lawyer_id) {
      const lawyer = await this.usersService.findOne(dto.assigned_lawyer_id);
      if (!lawyer) {
        throw new NotFoundException(`Avocat avec ID ${dto.assigned_lawyer_id} non trouvé`);
      }
    }

    // Valider les dates
    const startDate = new Date(dto.start_date);
    const deadline = new Date(dto.deadline);
    
    if (deadline <= startDate) {
      throw new BadRequestException('La date limite doit être postérieure à la date de début');
    }
    
    let procedureInstance: ProcedureInstance | any = null;

    if (dossier.procedureInstance) {
      procedureInstance = dossier.procedureInstance;
    }

    // ── Résolution du sub_stage_visit_id et stage_visit_id ───────────────────
    // Priorité : valeurs explicitement passées dans le DTO
    // Fallback  : détection automatique depuis la visite courante (sans lever d'exception)
    let subStageVisitId: string | undefined = dto.sub_stage_visit_id;
    let stageVisitId: string | undefined = dto.stage_visit_id;

    if (!subStageVisitId && procedureInstance?.currentVisit) {
      subStageVisitId = procedureInstance.currentVisit.currentSubStageVisitId ?? undefined;
    }
    if (!stageVisitId && procedureInstance?.currentVisit) {
      stageVisitId = procedureInstance.currentVisit.id ?? undefined;
    }
    const procedureInstanceId =
      procedureInstance?.id ?? dossier.procedureInstanceId ?? undefined;
    const visitBinding = await this.resolveProcedureVisitBinding(
      procedureInstanceId,
      stageVisitId,
      subStageVisitId,
    );
    stageVisitId = visitBinding.stageVisitId;
    subStageVisitId = visitBinding.subStageVisitId;

    // Création de l'entité
    const diligence = this.repository.create({
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority || DiligencePriority.MEDIUM,
      start_date: startDate,
      deadline: deadline,
      budget_hours: dto.budget_hours,
      scope: dto.scope,
      client_reference: dto.client_reference,
      dossier: { id: dossier.id },
      assigned_lawyer: dto.assigned_lawyer_id ? { id: dto.assigned_lawyer_id } : undefined,
      status: DiligenceStatus.DRAFT,
      confidential: dto.confidential ?? true,
      sub_stage_visit_id: subStageVisitId,
      stageVisit_id: stageVisitId,
      procedure_instance_id: procedureInstanceId,
    });
    return this.dataSource.transaction(async (manager) => {
      if (dto.assigned_lawyer_id) {
        await this.assertActiveDossierMember(
          manager,
          dto.dossier_id,
          dto.assigned_lawyer_id,
        );
      }
      const saved = await manager.save(diligence);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'diligence.created',
        resourceType: 'Diligence',
        resourceId: saved.id,
        dossierId: dto.dossier_id,
        afterState: {
          status: saved.status,
          title: saved.title,
          assignedLawyerId: saved.assigned_lawyer_id,
          deadline: saved.deadline,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'diligence.created',
        aggregateType: 'Diligence',
        aggregateId: saved.id,
        idempotencyKey: `diligence-created:${audit.id}`,
        payload: {
          diligenceId: saved.id,
          dossierId: dto.dossier_id,
          actorId,
          notifyClient: dto.notify_client === true,
        },
      });
      return plainToInstance(DiligenceResponseDto, saved);
    });
  }

  /**
   * 📄 Récupération de toutes les diligences
   */
  async findAll(dossierIds?: number[]): Promise<Diligence[]> {
    if (dossierIds && dossierIds.length === 0) return [];
    return this.repository.find({
      where: dossierIds ? { dossier_id: In(dossierIds) } : undefined,
      relations: ['dossier', 'dossier.client', 'assigned_lawyer', 'findings'],
      order: { deadline: 'ASC', created_at: 'DESC' },
    });
  }

  /**
   * 🔎 Trouver une diligence par ID
   */
  async findOne(id: number): Promise<DiligenceResponseDto | any> {
    const diligence = await this.repository.findOne({
      where: { id },
      relations: ['dossier', 'dossier.client', 'assigned_lawyer', 'findings', 'documents'],
    });

    if (!diligence) {
      throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
    }

    return plainToInstance(DiligenceResponseDto, diligence);
  }

  async getAccessScope(
    id: number,
  ): Promise<{ dossierId: number; confidentialityLevel: number }> {
    const diligence = await this.repository.findOne({
      where: { id },
      select: ['id', 'dossier_id', 'confidential'],
    });
    if (!diligence) {
      throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
    }
    return {
      dossierId: diligence.dossier_id,
      confidentialityLevel: 1,
    };
  }

  /**
   * ✏️ Mise à jour d'une diligence
   */
  async update(
    id: number,
    dto: UpdateDiligenceDto,
    actorId: number,
  ): Promise<Diligence> {
    let assignedLawyerId: number | undefined;
    if (dto.assigned_lawyer_id !== undefined) {
      const lawyer = await this.usersService.findOne(dto.assigned_lawyer_id);
      if (!lawyer) {
        throw new NotFoundException(
          `Avocat avec ID ${dto.assigned_lawyer_id} non trouvé`,
        );
      }
      assignedLawyerId = dto.assigned_lawyer_id;
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const diligence = await manager.getRepository(Diligence).findOne({
        where: { id },
        relations: ['assigned_lawyer'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!diligence) {
        throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
      }
      if (
        [DiligenceStatus.COMPLETED, DiligenceStatus.CANCELLED].includes(
          diligence.status,
        )
      ) {
        throw new BadRequestException(
          'Une diligence dans un état terminal ne peut plus être modifiée',
        );
      }
      if (assignedLawyerId) {
        await this.assertActiveDossierMember(
          manager,
          diligence.dossier_id,
          assignedLawyerId,
        );
      }

      const startDate = dto.start_date
        ? new Date(dto.start_date)
        : diligence.start_date;
      const deadline = dto.deadline
        ? new Date(dto.deadline)
        : diligence.deadline;
      if (deadline <= startDate) {
        throw new BadRequestException(
          'La date limite doit être postérieure à la date de début',
        );
      }

      const beforeState = this.auditState(diligence);
      Object.assign(diligence, {
        title: dto.title ?? diligence.title,
        description: dto.description ?? diligence.description,
        type: dto.type ?? diligence.type,
        priority: dto.priority ?? diligence.priority,
        start_date: startDate,
        deadline,
        budget_hours: dto.budget_hours ?? diligence.budget_hours,
        scope: dto.scope ?? diligence.scope,
        client_reference:
          dto.client_reference ?? diligence.client_reference,
        confidential: dto.confidential ?? diligence.confidential,
      });
      if (assignedLawyerId) {
        diligence.assigned_lawyer = {
          id: assignedLawyerId,
        } as User;
        diligence.assigned_lawyer_id = assignedLawyerId;
      }

      const saved = await manager.save(diligence);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'diligence.updated',
        resourceType: 'Diligence',
        resourceId: saved.id,
        dossierId: saved.dossier_id,
        beforeState,
        afterState: this.auditState(saved),
      });
      await this.enqueueDiligenceEvent(
        manager,
        audit.id,
        'diligence.updated',
        saved,
        actorId,
      );
      return saved;
    });
  }

  /**
   * ❌ Suppression d'une diligence
   */
  async remove(id: number, actorId: number): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const diligence = await manager.getRepository(Diligence).findOne({
        where: { id },
        relations: ['findings'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!diligence) {
        throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
      }
      if (diligence.status !== DiligenceStatus.DRAFT) {
        throw new BadRequestException(
          'Seule une diligence brouillon peut être supprimée',
        );
      }
      if (diligence.findings?.length) {
        throw new BadRequestException(
          'La diligence contient des constats et ne peut pas être supprimée',
        );
      }

      const beforeState = this.auditState(diligence);
      await manager.remove(diligence);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'diligence.deleted',
        resourceType: 'Diligence',
        resourceId: id,
        dossierId: diligence.dossier_id,
        beforeState,
      });
      await this.enqueueDiligenceEvent(
        manager,
        audit.id,
        'diligence.deleted',
        diligence,
        actorId,
      );
    });
  }

  /**
   * ✅ Marquer une diligence comme terminée
   */
  async complete(
    id: number,
    recommendations: string | undefined,
    actorId: number,
  ): Promise<Diligence> {
    return this.transition(
      id,
      actorId,
      'diligence.completed',
      (diligence) => {
        if (diligence.status !== DiligenceStatus.REVIEW) {
          throw new BadRequestException(
            'La diligence doit être en relecture avant sa clôture',
          );
        }
        const blockingCritical = (diligence.findings ?? []).filter(
          (finding) =>
            finding.severity === 'critical' &&
            !['resolved', 'waived'].includes(finding.status),
        );
        if (blockingCritical.length > 0) {
          throw new BadRequestException(
            'Les constats critiques doivent être résolus ou acceptés avant la clôture',
          );
        }
        diligence.complete(recommendations);
      },
    );
  }

  async start(id: number, actorId: number): Promise<Diligence> {
    return this.transition(
      id,
      actorId,
      'diligence.started',
      (diligence) => {
        if (diligence.status !== DiligenceStatus.DRAFT) {
          throw new BadRequestException(
            'Seule une diligence brouillon peut être démarrée',
          );
        }
        diligence.status = DiligenceStatus.IN_PROGRESS;
      },
    );
  }

  async submitForReview(id: number, actorId: number): Promise<Diligence> {
    return this.transition(
      id,
      actorId,
      'diligence.review_submitted',
      (diligence) => {
        if (diligence.status !== DiligenceStatus.IN_PROGRESS) {
          throw new BadRequestException(
            'Seule une diligence en cours peut être soumise en relecture',
          );
        }
        diligence.status = DiligenceStatus.REVIEW;
      },
    );
  }

  /**
   * 🚫 Annuler une diligence
   */
  async cancel(
    id: number,
    reason: string | undefined,
    actorId: number,
  ): Promise<Diligence> {
    if (!reason?.trim() || reason.trim().length < 10) {
      throw new BadRequestException(
        'Un motif d’annulation d’au moins 10 caractères est obligatoire',
      );
    }
    const justification = reason.trim();
    return this.transition(
      id,
      actorId,
      'diligence.cancelled',
      (diligence) => {
        if (
          [DiligenceStatus.COMPLETED, DiligenceStatus.CANCELLED].includes(
            diligence.status,
          )
        ) {
          throw new BadRequestException(
            'La diligence est déjà dans un état terminal',
          );
        }
        diligence.cancel(justification);
      },
      justification,
    );
  }

  /**
   * 📊 Générer le rapport final
   */
  async generateReport(id: number, actorId: number): Promise<Diligence> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const diligence = await manager.getRepository(Diligence).findOne({
        where: { id },
        relations: [
          'findings',
          'dossier',
          'dossier.client',
          'assigned_lawyer',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!diligence) {
        throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
      }
      if (
        ![DiligenceStatus.REVIEW, DiligenceStatus.COMPLETED].includes(
          diligence.status,
        )
      ) {
        throw new BadRequestException(
          'Le rapport ne peut être préparé qu’en relecture ou après clôture',
        );
      }

      const findingsBySeverity = {
        critical: diligence.findings.filter(
          (finding) => finding.severity === 'critical',
        ).length,
        high: diligence.findings.filter(
          (finding) => finding.severity === 'high',
        ).length,
        medium: diligence.findings.filter(
          (finding) => finding.severity === 'medium',
        ).length,
        low: diligence.findings.filter(
          (finding) => finding.severity === 'low',
        ).length,
      };
      const beforeState = this.auditState(diligence);
      diligence.findings_summary = [
        'Résumé de l’audit :',
        `- ${findingsBySeverity.critical} anomalies critiques`,
        `- ${findingsBySeverity.high} anomalies haute priorité`,
        `- ${findingsBySeverity.medium} anomalies moyenne priorité`,
        `- ${findingsBySeverity.low} anomalies faible priorité`,
      ].join('\n');
      diligence.report_generated = true;
      // Aucun chemin public fictif : le worker produit ensuite une version
      // documentaire privée à partir de l'événement durable.
      diligence.report_url = null as any;

      const saved = await manager.save(diligence);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'diligence.report_prepared',
        resourceType: 'Diligence',
        resourceId: saved.id,
        dossierId: saved.dossier_id,
        beforeState,
        afterState: this.auditState(saved),
      });
      await this.enqueueDiligenceEvent(
        manager,
        audit.id,
        'diligence.report_prepared',
        saved,
        actorId,
      );
      return saved;
    });
  }

  /**
   * 📄 Ajouter des documents à la diligence
   */
  async addDocumentsToDiligence(
    diligenceId: number,
    documentIds: number[],
    actorId: number,
  ) {
    const normalizedIds = [
      ...new Set((documentIds ?? []).map(Number).filter(Number.isInteger)),
    ];
    if (normalizedIds.length === 0) {
      throw new BadRequestException(
        'Au moins un identifiant de document est obligatoire',
      );
    }
    const documents =
      await this.documentCustomerService.findByIds(normalizedIds);
    if (documents.length !== normalizedIds.length) {
      throw new BadRequestException(
        'Un ou plusieurs documents sont introuvables dans le cabinet',
      );
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const diligence = await manager.getRepository(Diligence).findOne({
        where: { id: diligenceId },
        relations: ['documents'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!diligence) {
        throw new NotFoundException('Diligence non trouvée');
      }
      if (
        documents.some(
          (document: any) =>
            Number(document.dossier_id) !== Number(diligence.dossier_id),
        )
      ) {
        throw new BadRequestException(
          'Tous les documents doivent appartenir au dossier de la diligence',
        );
      }

      const beforeIds = (diligence.documents ?? []).map((document) =>
        Number(document.id),
      );
      const byId = new Map(
        [...(diligence.documents ?? []), ...documents].map((document: any) => [
          Number(document.id),
          document,
        ]),
      );
      diligence.documents = [...byId.values()];
      const saved = await manager.save(diligence);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'diligence.documents_attached',
        resourceType: 'Diligence',
        resourceId: saved.id,
        dossierId: saved.dossier_id,
        beforeState: { documentIds: beforeIds },
        afterState: {
          documentIds: saved.documents.map((document) => Number(document.id)),
        },
      });
      await this.enqueueDiligenceEvent(
        manager,
        audit.id,
        'diligence.documents_attached',
        saved,
        actorId,
        { documentIds: normalizedIds },
      );
      return saved;
    });
  }

  /**
   * ⏰ Récupérer les diligences avec échéances proches
   */
  async findUpcomingDeadlines(
    days: number = 7,
    dossierIds?: number[],
  ): Promise<Diligence[]> {
    if (dossierIds && dossierIds.length === 0) return [];
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return this.repository.find({
      where: {
        ...(dossierIds ? { dossier_id: In(dossierIds) } : {}),
        deadline: MoreThan(today),
        status: In([DiligenceStatus.DRAFT, DiligenceStatus.IN_PROGRESS, DiligenceStatus.REVIEW]),
      },
      relations: ['dossier', 'dossier.client', 'assigned_lawyer'],
      order: { deadline: 'ASC' },
    });
  }

  /**
   * ⚠️ Récupérer les diligences en retard
   */
  async findOverdue(dossierIds?: number[]): Promise<Diligence[]> {
    if (dossierIds && dossierIds.length === 0) return [];
    const today = new Date();

    return this.repository.find({
      where: {
        ...(dossierIds ? { dossier_id: In(dossierIds) } : {}),
        deadline: LessThan(today),
        status: In([DiligenceStatus.DRAFT, DiligenceStatus.IN_PROGRESS, DiligenceStatus.REVIEW]),
      },
      relations: ['dossier', 'dossier.client', 'assigned_lawyer'],
      order: { deadline: 'ASC' },
    });
  }

  /**
   * 📊 Statistiques par type
   */
  async getStatsByType(): Promise<any> {
    const result = await this.repository
      .createQueryBuilder('diligence')
      .select('diligence.type', 'type')
      .addSelect('COUNT(diligence.id)', 'count')
      .groupBy('diligence.type')
      .getRawMany();

    return result;
  }

  /**
   * 📊 Statistiques par statut
   */
  async getStatsByStatus(): Promise<any> {
    const result = await this.repository
      .createQueryBuilder('diligence')
      .select('diligence.status', 'status')
      .addSelect('COUNT(diligence.id)', 'count')
      .groupBy('diligence.status')
      .getRawMany();

    return result;
  }

  private async resolveProcedureVisitBinding(
    procedureInstanceId: string | undefined,
    stageVisitId: string | undefined,
    subStageVisitId: string | undefined,
  ): Promise<{
    stageVisitId: string | undefined;
    subStageVisitId: string | undefined;
  }> {
    if (!stageVisitId && !subStageVisitId) {
      return { stageVisitId, subStageVisitId };
    }
    if (!procedureInstanceId) {
      throw new BadRequestException(
        'Une visite procédurale ne peut être liée qu’à un dossier disposant d’une instance',
      );
    }

    let resolvedStageVisitId = stageVisitId;
    if (subStageVisitId) {
      const subStageVisit = await this.dataSource
        .getRepository(SubStageVisit)
        .findOne({ where: { id: subStageVisitId } });
      if (!subStageVisit) {
        throw new BadRequestException(
          'La visite de sous-étape indiquée est introuvable',
        );
      }
      if (
        resolvedStageVisitId &&
        resolvedStageVisitId !== subStageVisit.stageVisitId
      ) {
        throw new BadRequestException(
          'La visite de sous-étape n’appartient pas à la visite d’étape indiquée',
        );
      }
      resolvedStageVisitId = subStageVisit.stageVisitId;
    }

    const stageVisit = await this.dataSource
      .getRepository(StageVisit)
      .findOne({ where: { id: resolvedStageVisitId! } });
    if (
      !stageVisit ||
      stageVisit.instanceId !== String(procedureInstanceId)
    ) {
      throw new BadRequestException(
        'La visite procédurale n’appartient pas à l’instance du dossier',
      );
    }
    return {
      stageVisitId: stageVisit.id,
      subStageVisitId,
    };
  }

  private async assertActiveDossierMember(
    manager: EntityManager,
    dossierId: number,
    userId: number,
  ): Promise<void> {
    const member = await manager.getRepository(DossierMember).findOne({
      where: {
        dossierId,
        userId,
      },
    });
    const now = new Date();
    if (
      !member ||
      member.revokedAt ||
      member.validFrom > now ||
      (member.validUntil && member.validUntil <= now)
    ) {
      throw new BadRequestException(
        'L’avocat assigné doit être un membre actif du dossier',
      );
    }
  }

  private transition(
    id: number,
    actorId: number,
    action: string,
    mutate: (diligence: Diligence) => void,
    justification?: string,
  ): Promise<Diligence> {
    return this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager: EntityManager) => {
        const diligence = await manager.getRepository(Diligence).findOne({
          where: { id },
          relations: ['findings'],
          lock: { mode: 'pessimistic_write' },
        });
        if (!diligence) {
          throw new NotFoundException(
            `Diligence avec ID ${id} introuvable`,
          );
        }

        const beforeState = this.auditState(diligence);
        mutate(diligence);
        const saved = await manager.save(diligence);
        const audit = await this.auditService.append(manager, {
          actorId,
          action,
          resourceType: 'Diligence',
          resourceId: saved.id,
          dossierId: saved.dossier_id,
          beforeState,
          afterState: this.auditState(saved),
          justification,
        });
        await this.enqueueDiligenceEvent(
          manager,
          audit.id,
          action,
          saved,
          actorId,
          justification ? { justification } : undefined,
        );
        return saved;
      },
    );
  }

  private enqueueDiligenceEvent(
    manager: EntityManager,
    auditId: string,
    eventType: string,
    diligence: Diligence,
    actorId: number,
    extraPayload: Record<string, any> = {},
  ) {
    return this.outboxService.enqueue(manager, {
      eventType,
      aggregateType: 'Diligence',
      aggregateId: diligence.id,
      idempotencyKey: `${eventType}:${auditId}`,
      payload: {
        diligenceId: diligence.id,
        dossierId: diligence.dossier_id,
        actorId,
        status: diligence.status,
        ...extraPayload,
      },
    });
  }

  private auditState(diligence: Diligence): Record<string, any> {
    return {
      status: diligence.status,
      title: diligence.title,
      type: diligence.type,
      priority: diligence.priority,
      assignedLawyerId: diligence.assigned_lawyer_id ?? null,
      startDate: diligence.start_date ?? null,
      deadline: diligence.deadline ?? null,
      completionDate: diligence.completion_date ?? null,
      reportGenerated: diligence.report_generated === true,
    };
  }
}
