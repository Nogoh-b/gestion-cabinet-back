// src/modules/diligences/diligences.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { LessThan, MoreThan, Repository, In } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DossiersService } from '../dossiers/dossiers.service';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { CreateDiligenceDto } from './dto/create-diligence.dto';
import { UpdateDiligenceDto } from './dto/update-diligence.dto';
import { DiligenceResponseDto } from './dto/response-diligence.dto';
import { Diligence, DiligenceStatus, DiligencePriority } from './entities/diligence.entity';
import { UsersService } from '../iam/user/user.service';
import { FindingsService } from '../finding/finding.service';
import { User } from '../iam/user/entities/user.entity';

@Injectable()
export class DiligencesService extends BaseServiceV1<Diligence> {
  constructor(
    @InjectRepository(Diligence)
    protected readonly repository: Repository<Diligence>,
    protected readonly paginationService: PaginationServiceV1,
    private readonly dossierService: DossiersService,
    private readonly usersService: UsersService,
    private readonly documentCustomerService: DocumentCustomerService,
    @Inject(forwardRef(() => FindingsService))
    private readonly findingsService: FindingsService,
  ) {
    console.log(forwardRef)
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
      relationFields: ['dossier', 'dossier.client', 'assigned_lawyer', 'findings', 'documents'],
    };
  }

  /**
   * ➕ Création d'une diligence
   */
  async create(dto: CreateDiligenceDto): Promise<DiligenceResponseDto> {
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
    });

    return plainToInstance(DiligenceResponseDto,await this.repository.save(diligence));
  }

  /**
   * 📄 Récupération de toutes les diligences
   */
  async findAll(): Promise<Diligence[]> {
    return this.repository.find({
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

  /**
   * ✏️ Mise à jour d'une diligence
   */
  async update(id: number, dto: UpdateDiligenceDto): Promise<Diligence> {

    console.log(id ,  ' ', dto)
    const diligence = await this.repository.findOne({
      where: { id },
      relations: ['dossier', 'assigned_lawyer'],
    });

    if (!diligence) {
      throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
    }

    // Vérifications des relations si modifiées
    if (dto.dossier_id && dto.dossier_id !== diligence.dossier?.id) {
      const dossier = await this.dossierService.findOne(dto.dossier_id);
      if (!dossier) {
        throw new NotFoundException(`Dossier avec ID ${dto.dossier_id} non trouvé`);
      }
      diligence.dossier = dossier;
    }

    if (dto.assigned_lawyer_id && dto.assigned_lawyer_id !== diligence.assigned_lawyer?.id) {
      if (dto.assigned_lawyer_id) {
        const lawyer = await this.usersService.findOne(dto.assigned_lawyer_id);
        if (!lawyer) {
          throw new NotFoundException(`Avocat avec ID ${dto.assigned_lawyer_id} non trouvé`);
        }
        diligence.assigned_lawyer = (lawyer as any) as User;
      } else {
        diligence.assigned_lawyer = null as any;
      }
    }

    // Validation des dates si modifiées
    if (dto.start_date || dto.deadline) {
      const startDate = dto.start_date ? new Date(dto.start_date) : diligence.start_date;
      const deadline = dto.deadline ? new Date(dto.deadline) : diligence.deadline;
      
      if (deadline <= startDate) {
        throw new BadRequestException('La date limite doit être postérieure à la date de début');
      }
    }

    // Mise à jour des champs simples
    Object.assign(diligence, {
      title: dto.title ?? diligence.title,
      description: dto.description ?? diligence.description,
      type: dto.type ?? diligence.type,
      priority: dto.priority ?? diligence.priority,
      start_date: dto.start_date ? new Date(dto.start_date) : diligence.start_date,
      deadline: dto.deadline ? new Date(dto.deadline) : diligence.deadline,
      budget_hours: dto.budget_hours ?? diligence.budget_hours,
      scope: dto.scope ?? diligence.scope,
      client_reference: dto.client_reference ?? diligence.client_reference,
      status : dto.status ?? diligence.status
    });

    return this.repository.save(diligence);
  }

  /**
   * ❌ Suppression d'une diligence
   */
  async remove(id: number): Promise<void> {
    const diligence = await this.repository.findOne({
      where: { id },
      relations: ['findings'],
    });

    if (!diligence) {
      throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
    }

    // Supprimer d'abord les findings associés (ou laisser le cascade gérer)
    if (diligence.findings && diligence.findings.length > 0) {
      await this.findingsService.removeMany(diligence.findings.map(f => f.id));
    }

    await this.repository.remove(diligence);
  }

  /**
   * ✅ Marquer une diligence comme terminée
   */
  async complete(id: number, recommendations?: string): Promise<Diligence> {
    const diligence = await this.findOne(id);
    const diligenceEntity = plainToInstance(Diligence, diligence);
    
    diligenceEntity.complete(recommendations);
    return this.repository.save(diligenceEntity);
  }

  /**
   * 🚫 Annuler une diligence
   */
  async cancel(id: number, reason?: string): Promise<Diligence> {
    const diligence = await this.findOne(id);
    const diligenceEntity = plainToInstance(Diligence, diligence);
    
    diligenceEntity.cancel(reason);
    return this.repository.save(diligenceEntity);
  }

  /**
   * 📊 Générer le rapport final
   */
  async generateReport(id: number): Promise<Diligence> {
    const diligence = await this.repository.findOne({
      where: { id },
      relations: ['findings', 'dossier', 'dossier.client', 'assigned_lawyer'],
    });

    if (!diligence) {
      throw new NotFoundException(`Diligence avec ID ${id} introuvable`);
    }

    // Générer un résumé des findings par sévérité
    const findingsBySeverity = {
      critical: diligence.findings.filter(f => f.severity === 'critical').length,
      high: diligence.findings.filter(f => f.severity === 'high').length,
      medium: diligence.findings.filter(f => f.severity === 'medium').length,
      low: diligence.findings.filter(f => f.severity === 'low').length,
    };

    diligence.findings_summary = `Résumé de l'audit: 
      - ${findingsBySeverity.critical} anomalies critiques
      - ${findingsBySeverity.high} anomalies haute priorité
      - ${findingsBySeverity.medium} anomalies moyenne priorité
      - ${findingsBySeverity.low} anomalies faible priorité
    `;

    diligence.report_generated = true;
    diligence.report_url = `/reports/diligence-${id}.pdf`; // À implémenter avec un vrai service de génération PDF

    return this.repository.save(diligence);
  }

  /**
   * 📄 Ajouter des documents à la diligence
   */
  async addDocumentsToDiligence(diligenceId: number, documentIds: number[]) {
    const diligence = await this.repository.findOne({
      where: { id: diligenceId },
      relations: ['documents'],
    });

    if (!diligence) {
      throw new NotFoundException('Diligence non trouvée');
    }

    const documents = await this.documentCustomerService.findByIds(documentIds);
    diligence.documents = [...(diligence.documents || []), ...documents];
    
    return await this.repository.save(diligence);
  }

  /**
   * ⏰ Récupérer les diligences avec échéances proches
   */
  async findUpcomingDeadlines(days: number = 7): Promise<Diligence[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return this.repository.find({
      where: {
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
  async findOverdue(): Promise<Diligence[]> {
    const today = new Date();

    return this.repository.find({
      where: {
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
}