// src/modules/dossiers/dossiers.service.ts
import { plainToInstance } from 'class-transformer';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { UserRole } from 'src/core/enums/user-role.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { MailService } from 'src/core/shared/emails/emails.service';
import { PaginatedResult, PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { SearchFilter, SearchUtils } from 'src/core/shared/utils/search.utils';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';


import {
  Repository,
  In,
  FindOptionsWhere,
  DataSource,
  EntityManager,
} from 'typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';














import { InjectRepository } from '@nestjs/typeorm';




import { Employee } from '../agencies/employee/entities/employee.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { CreateConversationDto } from '../chat/dto/create-conversation.dto';
import { ChatService } from '../chat/services/chat/chat.service';
import { Customer } from '../customer/customer/entities/customer.entity';
import { DocumentVersionService } from '../documents/document-customer/document-version.service';
import { User } from '../iam/user/entities/user.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { InstanceStatus } from '../procedure/entities/enums/instance-status.enum';
import { AudienceStatus } from '../audiences/entities/audience.entity';
import {
  InvoiceNature,
  StatutFacture,
  TypeFacture,
} from '../facture/dto/create-facture.dto';
import { FactureService } from '../facture/facture.service';
import { StageVisit } from '../procedure/entities/stage-visit.entity';
import { ProcedureInstanceService } from '../procedure/services/procedure-instance.service';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { CloseDossierDto } from './dto/close-dossier.dto';
import { CreateDossierDto, UploadDocumentToSubStageDto } from './dto/create-dossier.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { DangerLevel, Dossier, DossierOutcome } from './entities/dossier.entity';
import {
  DossierMember,
  DossierMemberRole,
} from './entities/dossier-member.entity';
import {
  ProcedureTemplate,
  ProcedureTemplateLifecycle,
} from '../procedure/entities/procedure-template.entity';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { createHash } from 'crypto';

















// import { StepsService } from './step.service';

// import { DistributionItem, DossierStatsDto, EvolutionData, FinancialStats, LawyerStats, RecentDossier, TimelineStats, UrgentDossier } from 'src/core/types/base-stats.dto';



@Injectable()
export class DossiersService  extends BaseServiceV1<Dossier>  {
  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(Customer)
    private readonly clientRepository: Repository<Customer>,
    @InjectRepository(Employee)
    private readonly userRepository: Repository<Employee>,
    @InjectRepository(ProcedureType)
    private readonly procedureTypeRepository: Repository<ProcedureType>,
    protected readonly paginationService: PaginationServiceV1,
    protected readonly documentVersionService: DocumentVersionService,
    protected readonly chatService: ChatService,
    // protected readonly stepsService: StepsService,
    private procedureInstanceService: ProcedureInstanceService,
    private readonly planQuotaService: PlanQuotaService,
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    @Inject(forwardRef(() => FactureService))
    private readonly factureService: FactureService,
    protected readonly emailsService?: MailService, // Optionnel

  ) {
    super(dossierRepository, paginationService, emailsService);
  }

  private resolvePublishedProcedureTemplate(
    ...templates: Array<ProcedureTemplate | null | undefined>
  ): ProcedureTemplate | null {
    return (
      templates.find(
        (template) =>
          template?.lifecycleStatus === ProcedureTemplateLifecycle.PUBLISHED &&
          Boolean(template.contentHash),
      ) ?? null
    );
  }
 
  

/**
   * Override des options de recherche par défaut pour Customer
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      // Champs pour la recherche globale
      searchFields: [
        'dossier_number',
        'object',
        'jurisdiction',
        'jurisdiction.name',
        'court_name',
        'case_number',
        'opposing_party_name',
        'opposing_party_lawyer',
        'opposing_party_contact',
        'client.first_name',
        'client.last_name',
        'procedure_type.name',
        'procedure_subtype.name',
        'client.email',
        'danger_level'
      ],
      
      // Champs pour recherche exacte
      exactMatchFields: [
        'id',
        'status',
        'confidentiality_level',
        'priority_level',
        'budget_estimate',
        'danger_level'
      ],
      
      // Champs pour ranges de dates
      /*dateRangeFields: [
        'created_at',
        'updated_at',
        'opening_date',
        'closing_date'
      ],*/
      
      // Champs de relations pour filtrage
      relationFields: [
        'client',
        'client.location_city',
        'lawyer',
        'lawyer.user',
        'procedure_type',
        // 'procedureInstance',

        'procedure_subtype',
        'documents',
        'audiences',
        'factures',
        // 'factures.paiements',
        // 'steps',
        'jurisdiction',
        'collaborators',
        'conversation',
        'collaborators.user',
        'diligences'
        // 'comments',
        // 'comments.user' 
      ]
    };

  }
  /**
   * Recherche avancée des clients avec relations
   */
  // Dans votre DossierService
  async searhDosiers(
    criteria: any,
    paginationParams?: any,
    relations: string[] = ['client', 'lawyer', 'diligences', 'jurisdiction', 'procedure_type', 'procedure_subtype', 'documents', 'audiences', 'factures', 'collaborators']
  ) {
    return this.searchWithTransformer(
      criteria,
      DossierResponseDto, // ✅ Juste passer la classe DTO
      paginationParams,
      relations,
      { created_at: 'DESC' } as any
    );
  }


  async create(createDossierDto: CreateDossierDto, createdBy: User): Promise<DossierResponseDto> {
    // ── Vérification quota plan ────────────────────────────────────────────
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      const currentCount = await this.dossierRepository.count();
      await this.planQuotaService.checkLimit(tenantId, 'dossiers', currentCount);
    }

    // Validation de la paire type/sous-type (R8)
    const isValidPair = await this.validateProcedureTypeSubtype(
      createDossierDto.procedure_type_id,
      createDossierDto.procedure_subtype_id
    );

    if (!isValidPair) {
      throw new BadRequestException('Le sous-type ne correspond pas au type de procédure');
    }

    // Vérification des entités liées
    const [client, lawyer, procedureType, procedureSubtype] = await Promise.all([
      this.clientRepository.findOne({ where: { id: Number(createDossierDto.client_id) } }),
      this.userRepository.findOne({ where: { id: createDossierDto.lawyer_id }, relations: ['user'] }),
      this.procedureTypeRepository.findOne({
        where: { id: createDossierDto.procedure_type_id },
        relations: ['procedure_template'],
      }),
      this.procedureTypeRepository.findOne({
        where: { id: createDossierDto.procedure_subtype_id },
        relations: ['procedure_template', 'parent', 'parent.procedure_template'],
      }),
    ]);

    if (!client) {
      throw new NotFoundException('Client non trouvé');
    }
    if (!lawyer) {
      throw new NotFoundException('Avocat non trouvé');
    }
    if (!procedureType) {
      throw new NotFoundException('Type de procédure non trouvé');
    }
    if (!procedureSubtype) {
      throw new NotFoundException('Sous-type de procédure non trouvé');
    }


    // Génération du numéro de dossier
    const dossierNumber = await this.generateDossierNumber();
    if(!createDossierDto.dossier_number){
      createDossierDto.dossier_number = dossierNumber
    } 

    // let procedureInstanceDTO = new CreateProcedureInstanceDto();
    // procedureInstanceDTO.templateId = procedureSubtype.procedure_template?.id || procedureType.procedure_template?.id;
    // procedureInstanceDTO.title = createDossierDto.dossier_number;

    // const procedureInstance = await this.procedureInstanceService.create(procedureInstanceDTO, createdBy.id.toString())

    const { notes: _notes, mode: _mode, ...writableDossierData } = createDossierDto;
    const dossier = this.dossierRepository.create({
      ...writableDossierData,
      dossier_number: dossierNumber,
      client,
      lawyer,
      jurisdiction_id : createDossierDto.jurisdiction_id ?? createDossierDto.jurisdiction ?? null,
      jurisdiction: (createDossierDto.jurisdiction_id ?? createDossierDto.jurisdiction)
        ? ({ id: createDossierDto.jurisdiction_id ?? createDossierDto.jurisdiction } as Jurisdiction)
        : null,
      procedure_type: procedureType,
      procedure_subtype: procedureSubtype,
      // procedureInstance,
      opening_date: createDossierDto.opening_date ? new Date(createDossierDto.opening_date) : new Date(),
      status: DossierStatus.DRAFT,
    });
    // Champ transient consommé par DossierSubscriber pour notifier le client.
    (dossier as any).notify_client = !!createDossierDto.notify_client;

    // Gestion des collaborateurs
    if (createDossierDto.collaborator_ids && createDossierDto.collaborator_ids.length > 0) {
      const collaborators = await this.userRepository.find({
        where: { id: In(createDossierDto.collaborator_ids) }
      });
      dossier.collaborators = collaborators;
    }

    // La conversation de suivi est créée par le DossierSubscriber
    // (onAfterCreate), source unique, dans la transaction d'insertion et avec
    // l'avocat + les collaborateurs comme participants. On ne la crée donc plus
    // ici : la créer en amont produisait une conversation orpheline doublonnée
    // (le subscriber écrasait ensuite le lien).
    const savedDossier = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(dossier);
      // Un template peut être porté par le sous-type ou hérité du type parent.
      const template = this.resolvePublishedProcedureTemplate(
        procedureSubtype.procedure_template,
        procedureType.procedure_template,
      );
      if (template) {
        const instance = await this.procedureInstanceService.create(
          {
            templateId: template.id,
            title: `Procédure - ${saved.dossier_number}`,
          },
          String((createdBy as any)?.id ?? 'system'),
          manager,
        );
        saved.procedureInstanceId = instance.id;
        await manager.save(saved);
      }
      const memberRepository = manager.getRepository(DossierMember);
      const initialMembers = new Map<
        number,
        DossierMemberRole
      >();
      initialMembers.set(Number(lawyer.id), DossierMemberRole.RESPONSIBLE);
      for (const collaborator of dossier.collaborators ?? []) {
        if (!initialMembers.has(Number(collaborator.id))) {
          initialMembers.set(
            Number(collaborator.id),
            DossierMemberRole.COLLABORATOR,
          );
        }
      }
      for (const [userId, role] of initialMembers) {
        await memberRepository.save(
          memberRepository.create({
            dossierId: saved.id,
            userId,
            role,
            confidentialityLevel: saved.confidentiality_level ? 1 : 0,
            validFrom: new Date(),
            validUntil: null,
            revokedAt: null,
            revokedBy: null,
          }),
        );
      }
      const audit = await this.auditService.append(manager, {
        actorId: (createdBy as any)?.id,
        action: 'dossier.created',
        resourceType: 'Dossier',
        resourceId: saved.id,
        dossierId: saved.id,
        afterState: {
          status: saved.status,
          dossierNumber: saved.dossier_number,
          clientId: saved.client_id,
          lawyerId: saved.lawyer_id,
          procedureTypeId: saved.procedure_type_id,
          procedureSubtypeId: saved.procedure_subtype_id,
          members: [...initialMembers.entries()].map(([userId, role]) => ({
            userId,
            role,
          })),
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'dossier.created',
        aggregateType: 'Dossier',
        aggregateId: saved.id,
        idempotencyKey: `dossier-created:${audit.id}`,
        payload: {
          dossierId: saved.id,
          actorId: (createdBy as any)?.id,
          notifyClient: Boolean(createDossierDto.notify_client),
        },
      });
      return saved;
    });
    return this.mapToResponseDto(savedDossier);
  }

  async findAll(searchDto: DossierSearchDto, user: User): Promise<any[]> {
    const whereConditions = this.buildWhereConditions(searchDto, user);

    const dossiers = await this.dossierRepository.find({
      where: whereConditions.length > 0 ? whereConditions : undefined,
      relations: [
        'client',
        'lawyer',
        'procedure_type',
        'procedure_subtype',
        'documents',
        'diligences',
        'audiences',
        'factures',
        'collaborators'
      ]
    });

    return dossiers;
  }

  async findAllPaginated(
    paginationParams: PaginationParamsDto,
    searchDto: DossierSearchDto,
    user: User
  ): Promise<PaginatedResult<DossierResponseDto>> {
    const whereConditions = this.buildWhereConditions(searchDto, user);
    
    return this.paginationService.paginateWithTransformer(
      this.dossierRepository,
      paginationParams,
      (dossiers) => Promise.all(dossiers.map(dossier => this.mapToResponseDto(dossier))),
      whereConditions,
      [
        'client',
        'lawyer',
        'lawyer.employee',
        'procedure_type',
        'procedure_subtype',
        'documents',
        'audiences',
        'factures'
      ]
    );
  }

  private buildWhereConditions(searchDto: DossierSearchDto, user: User): FindOptionsWhere<Dossier>[] {
    const conditions: FindOptionsWhere<Dossier>[] = [];
    const authUser = user as any;

    // Filtrage par rôle : avocat voit ses propres dossiers
    if (authUser.role === UserRole.AVOCAT) {
      conditions.push({ lawyer: { id: authUser.id } });
    }

    // Filtrage par rôle : client voit uniquement ses propres dossiers
    if (authUser.role === UserRole.CLIENT) {
      if (!authUser.customerId) return [{ client_id: -1 }]; // aucun résultat si customerId absent
      conditions.push({ client_id: authUser.customerId });
    }

    // Filtres de recherche
    const filters: SearchFilter[] = [];

    if (searchDto.search) {
      const searchConditions = SearchUtils.buildSearchConditions<Dossier>(
        searchDto.search,
        ['object', 'jurisdiction', 'dossier_number']
      );
      conditions.push(...searchConditions);
    }

    if (searchDto.status) {
      filters.push({ field: 'status', value: searchDto.status });
    }

    if (searchDto.client_id) {
      filters.push({ field: 'client', value: { id: searchDto.client_id } });
    }

    if (filters.length > 0) {
      const filterConditions = SearchUtils.buildWhereConditions<Dossier>(filters);
      conditions.push(filterConditions);
    }

    return conditions;
  }

// Dans votre DossierService
async findOne(id: number, user?: User): Promise<DossierResponseDto | any> {
  // ✅ Charger UNIQUEMENT le dossier avec ses relations directes
  const dossier = await this.dossierRepository.findOne({
    where: { id },
    relations: this.getDefaultSearchOptions().relationFields,
  });

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  // Contrôle d'accès : client ne peut voir que ses propres dossiers
  if (user) {
    this.checkDossierAccess(dossier, user);
  }

  // ✅ Charger procedureInstance séparément si nécessaire
  if (dossier.procedureInstanceId) {
    const procedureInstance = await this.procedureInstanceService.getWorkflowStatus(dossier.procedureInstanceId);
    
    if (procedureInstance) {
      dossier.procedureInstance = procedureInstance;
      (dossier as any).procedure_summary = procedureInstance.procedureSummary;
      
      // ✅ Charger les subStages de l'étape courante séparément si vraiment besoin
      // if (procedureInstance.currentStage) {
      //   const stageWithSubStages = await this.stageRepository.findOne({
      //     where: { id: procedureInstance.currentStage.id },
      //     relations: ['subStages'],
      //   });
        
      //   if (stageWithSubStages) {
      //     dossier.procedureInstance.currentStage = stageWithSubStages;
      //   }
      // }
    }
  }

  return plainToInstance(DossierResponseDto, dossier);
}
async findOneByInstance(procedureInstanceId: string): Promise<DossierResponseDto | any> {
  
  // ✅ Charger UNIQUEMENT le dossier avec ses relations directes
  const dossier = await this.dossierRepository.findOne({
    where: { procedureInstanceId },
    relations: [
      'client',
      'lawyer',
      'lawyer.user',
      'conversation',
      'factures',
      'procedure_type',
      'procedureInstance',
      'procedure_subtype',
      'jurisdiction',
    ],
  });

  if (!dossier) {
    throw new NotFoundException(`Dossiernon trouvé`);
  }

  // ✅ Charger procedureInstance séparément si nécessaire
  if (dossier.procedureInstanceId) {
    const procedureInstance = await this.procedureInstanceService.getWorkflowStatus(dossier.procedureInstanceId);
    
    if (procedureInstance) {
      dossier.procedureInstance = procedureInstance;
      (dossier as any).procedure_summary = procedureInstance.procedureSummary;
      
    }
  }

  return plainToInstance(DossierResponseDto, dossier);
}
  async update(
    id: number,
    updateDossierDto: UpdateDossierDto,
    user: User
  ): Promise<DossierResponseDto> {

    const dossier = await this.dossierRepository.findOne({
      where: { id },
      relations: [
        'client',
        'lawyer',
        'procedure_type',
        'procedure_subtype',
        'procedureInstance',
        'procedureInstance.currentStage',
        'collaborators',
        'jurisdiction',
      ],
    });

    if (!dossier) {
      throw new NotFoundException('Dossier non trouvé');
    }

    this.checkDossierAccess(dossier, user);

    if (updateDossierDto.collaborator_ids !== undefined) {
      throw new BadRequestException(
        'Utilisez la commande dédiée de synchronisation des membres du dossier',
      );
    }
    if (updateDossierDto.final_decision !== undefined) {
      throw new BadRequestException(
        'La décision finale se renseigne uniquement par la commande de clôture',
      );
    }
    if (
      dossier.status !== DossierStatus.DRAFT &&
      (
        updateDossierDto.client_id !== undefined ||
        updateDossierDto.lawyer_id !== undefined ||
        updateDossierDto.procedure_type_id !== undefined ||
        updateDossierDto.procedure_subtype_id !== undefined ||
        updateDossierDto.jurisdiction !== undefined ||
        updateDossierDto.jurisdiction_id !== undefined ||
        updateDossierDto.opening_date !== undefined
      )
    ) {
      throw new BadRequestException(
        "Le client, l'avocat responsable, la juridiction, le type de procédure et la date d'ouverture sont verrouillés après activation",
      );
    }

    /* =============================
    * Validation type / sous-type
    * ============================= */
    if (
      updateDossierDto.procedure_type_id !== undefined ||
      updateDossierDto.procedure_subtype_id !== undefined
    ) {
      const isValidPair = await this.validateProcedureTypeSubtype(
        updateDossierDto.procedure_type_id ?? dossier.procedure_type_id,
        updateDossierDto.procedure_subtype_id ?? dossier.procedure_subtype_id,
      );

      if (!isValidPair) {
        throw new BadRequestException(
          'Le sous-type ne correspond pas au type de procédure'
        );
      }
    }

    /* =============================
    * Chargement des entités liées
    * ============================= */
    if (updateDossierDto.client_id) {
      const client = await this.clientRepository.findOne({
        where: { id: Number(updateDossierDto.client_id) },
      });
      if (!client) throw new NotFoundException('Client non trouvé');
      dossier.client = client;
    }

    if (updateDossierDto.lawyer_id) {
      const lawyer = await this.userRepository.findOne({
        where: { id: updateDossierDto.lawyer_id },
      });
      if (!lawyer) throw new NotFoundException('Avocat non trouvé');
      dossier.lawyer = lawyer;
    }

    if (updateDossierDto.procedure_type_id) {
      const procedureType = await this.procedureTypeRepository.findOne({
        where: { id: updateDossierDto.procedure_type_id },
      });
      if (!procedureType) {
        throw new NotFoundException('Type de procédure non trouvé');
      }
      dossier.procedure_type = procedureType;
    }

    if (updateDossierDto.procedure_subtype_id) {
      const procedureSubtype = await this.procedureTypeRepository.findOne({
        where: { id: updateDossierDto.procedure_subtype_id },
      });
      if (!procedureSubtype) {
        throw new NotFoundException('Sous-type de procédure non trouvé');
      }
      dossier.procedure_subtype = procedureSubtype;
    }

    /* =============================
    * Juridiction
    * ============================= */
    if (updateDossierDto.jurisdiction) {
      dossier.jurisdiction_id = updateDossierDto.jurisdiction;
      dossier.jurisdiction = { id: updateDossierDto.jurisdiction } as Jurisdiction;
    }

    /* =============================
    * Dates
    * ============================= */
    if (updateDossierDto.opening_date) {
      dossier.opening_date = new Date(updateDossierDto.opening_date);
    }

    /* =============================
    * Statut
    * ============================= */
    /* =============================
    * Champs simples (merge)
    * ============================= */
    const beforeState = {
      status: dossier.status,
      clientId: dossier.client_id,
      lawyerId: dossier.lawyer_id,
      procedureTypeId: dossier.procedure_type_id,
      procedureSubtypeId: dossier.procedure_subtype_id,
      jurisdictionId: dossier.jurisdiction_id,
    };
    Object.assign(dossier, {
      ...updateDossierDto,
      dossier_number: dossier.dossier_number, // protection
    });
    if (updateDossierDto.notify_client !== undefined) {
      (dossier as any).notify_client = !!updateDossierDto.notify_client;
    }
    const updatedDossier = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(dossier);
      await this.auditService.append(manager, {
        actorId: (user as any)?.id ?? null,
        action: 'dossier.updated',
        resourceType: 'Dossier',
        resourceId: saved.id,
        dossierId: saved.id,
        beforeState,
        afterState: {
          status: saved.status,
          clientId: saved.client_id,
          lawyerId: saved.lawyer_id,
          procedureTypeId: saved.procedure_type_id,
          procedureSubtypeId: saved.procedure_subtype_id,
          jurisdictionId: saved.jurisdiction_id,
        },
      });
      return saved;
    });
    return this.mapToResponseDto(updatedDossier);
  }


  async remove(id: number, user: User): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const dossier = await manager.findOne(Dossier, {
        where: { id },
        relations: ['lawyer', 'collaborators'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!dossier) {
        throw new NotFoundException(`Dossier ${id} non trouvé`);
      }
      this.checkDossierAccess(dossier, user);
      if (dossier.status !== DossierStatus.DRAFT) {
        throw new BadRequestException(
          'Seul un dossier brouillon peut être supprimé',
        );
      }

      const audit = await this.auditService.append(manager, {
        actorId: (user as any)?.id,
        action: 'dossier.deleted',
        resourceType: 'Dossier',
        resourceId: dossier.id,
        dossierId: dossier.id,
        beforeState: {
          status: dossier.status,
          dossierNumber: dossier.dossier_number,
        },
        afterState: { deleted: true },
      });
      await manager.getRepository(Dossier).softDelete(id);
      await this.outboxService.enqueue(manager, {
        eventType: 'dossier.deleted',
        aggregateType: 'Dossier',
        aggregateId: dossier.id,
        idempotencyKey: `dossier-deleted:${audit.id}`,
        payload: {
          dossierId: dossier.id,
          actorId: (user as any)?.id,
          conversationId: dossier.conversation_id ?? null,
        },
      });
    });
  }

  async activate(id: number, user: User): Promise<DossierResponseDto> {
    await this.dossierRepository.manager.transaction(
      async (manager) => {
        const dossier = await manager.findOne(Dossier, {
          where: { id },
          relations: [
            'client',
            'lawyer',
            'collaborators',
            'procedure_type',
            'procedure_subtype',
            'jurisdiction',
          ],
          lock: { mode: 'pessimistic_write' },
        });
        if (!dossier) {
          throw new NotFoundException(`Dossier ${id} non trouvé`);
        }
        this.checkDossierAccess(dossier, user);
        if (dossier.status !== DossierStatus.DRAFT) {
          throw new BadRequestException(
            `Seul un dossier brouillon peut être activé (cycle actuel : ${dossier.status})`,
          );
        }

        const subtype = await manager.findOne(ProcedureType, {
          where: { id: dossier.procedure_subtype_id },
          relations: ['procedure_template', 'parent', 'parent.procedure_template'],
        });
        const template = this.resolvePublishedProcedureTemplate(
          subtype?.procedure_template,
          subtype?.parent?.procedure_template,
        );
        const missing: string[] = [];
        if (!dossier.client_id) missing.push('client');
        // Les informations de partie adverse sont facultatives à l'activation.
        if (!dossier.lawyer_id) missing.push('avocat responsable');
        if (!dossier.jurisdiction_id) missing.push('juridiction');
        if (!dossier.procedure_type_id || !dossier.procedure_subtype_id) {
          missing.push('type de procédure');
        }
        if (!template) {
          missing.push('version publiée et intègre du template');
        }
        if (missing.length > 0) {
          throw new BadRequestException({
            message: 'Le dossier ne satisfait pas les préconditions d’activation',
            missing,
          });
        }

        const instance = dossier.procedureInstanceId
          ? await manager.findOneByOrFail(ProcedureInstance, { id: dossier.procedureInstanceId })
          : await this.procedureInstanceService.create(
          {
            templateId: template!.id,
            title: `Procédure - ${dossier.dossier_number}`,
          },
          String((user as any)?.id ?? 'system'),
          manager,
        );
        const previousStatus = dossier.status;
        dossier.procedureInstanceId = instance.id;
        dossier.procedureInstance = instance;
        dossier.status = DossierStatus.ACTIVE;
        await manager.save(dossier);

        const openingInvoice = await this.createOpeningInvoice(
          manager,
          dossier,
          instance,
          user,
        );

        const memberRepository = manager.getRepository(DossierMember);
        const memberInputs = [
          {
            userId: Number(dossier.lawyer.id),
            role: DossierMemberRole.RESPONSIBLE,
          },
          ...(dossier.collaborators ?? []).map((collaborator) => ({
            userId: Number(collaborator.id),
            role: DossierMemberRole.COLLABORATOR,
          })),
        ];
        for (const input of memberInputs) {
          let member = await memberRepository.findOne({
            where: { dossierId: dossier.id, userId: input.userId },
          });
          if (!member) {
            member = memberRepository.create({
              dossierId: dossier.id,
              userId: input.userId,
              role: input.role,
              confidentialityLevel: dossier.confidentiality_level ? 1 : 0,
              validFrom: new Date(),
              validUntil: null,
              revokedAt: null,
              revokedBy: null,
            });
          } else {
            member.role = input.role;
            member.confidentialityLevel = dossier.confidentiality_level ? 1 : 0;
            member.validUntil = null;
            member.revokedAt = null;
            member.revokedBy = null;
          }
          await memberRepository.save(member);
        }
        await this.auditService.append(manager, {
          actorId: (user as any).id,
          action: 'dossier.activated',
          resourceType: 'Dossier',
          resourceId: dossier.id,
          dossierId: dossier.id,
          beforeState: { status: previousStatus, procedureInstanceId: null },
          afterState: {
            status: dossier.status,
            procedureInstanceId: instance.id,
            templateVersionId: instance.templateVersionId,
            openingInvoiceId: openingInvoice?.id ?? null,
          },
        });
        await this.outboxService.enqueue(manager, {
          eventType: 'dossier.activated',
          aggregateType: 'Dossier',
          aggregateId: dossier.id,
          idempotencyKey: `dossier-activated:${dossier.id}:${instance.id}`,
          payload: {
            dossierId: dossier.id,
            instanceId: instance.id,
            openingInvoiceId: openingInvoice?.id ?? null,
            actorId: (user as any).id,
            fromStatus: previousStatus,
            toStatus: dossier.status,
          },
        });
        return dossier;
      },
    );

    return this.findOne(id, user);
  }

  private async createOpeningInvoice(
    manager: EntityManager,
    dossier: Dossier,
    instance: ProcedureInstance,
    actor: User,
  ) {
    const cabinetId = Number(dossier.tenant_id ?? getCurrentTenantId());
    if (!Number.isSafeInteger(cabinetId) || cabinetId <= 0) {
      throw new BadRequestException(
        "Le cabinet du dossier est introuvable pour la facture d'ouverture",
      );
    }
    const cabinet = await manager.findOne(Cabinet, {
      where: { id: cabinetId },
    });
    if (!cabinet?.dossier_opening_fee_enabled) {
      return null;
    }

    const montantHT = Number(cabinet.dossier_opening_fee);
    const tauxTVA = Number(cabinet.dossier_opening_fee_tva ?? 0);
    if (
      !Number.isFinite(montantHT) ||
      montantHT <= 0 ||
      !Number.isFinite(tauxTVA) ||
      tauxTVA < 0
    ) {
      throw new BadRequestException(
        "La configuration de la facture d'ouverture du cabinet est invalide",
      );
    }
    const montantTVA = Math.round(montantHT * tauxTVA) / 100;
    const montantTTC = montantHT + montantTVA;
    const dateFacture = new Date();
    const dateEcheance = new Date(dateFacture);
    dateEcheance.setUTCDate(dateEcheance.getUTCDate() + 30);

    return this.factureService.createFacture(
      {
        dossierId: dossier.id,
        clientId: dossier.client_id,
        type: TypeFacture.FRAIS_PROCEDURE,
        dateFacture,
        dateEcheance,
        montantHT,
        tauxTVA,
        montantTVA,
        montantTTC,
        description:
          cabinet.dossier_opening_fee_label?.trim() ||
          "Frais d'ouverture de dossier",
        statut: StatutFacture.BROUILLON,
        notify_client: false,
      },
      {
        manager,
        dossier: {
          ...dossier,
          procedureInstance: instance,
        },
        client: dossier.client,
        actor: {
          id: Number((actor as any)?.id),
          userId: Number((actor as any)?.userId ?? (actor as any)?.id),
        },
      },
    );
  }

  async reopen(id: number, user: User): Promise<DossierResponseDto> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const dossier = await manager.findOne(Dossier, {
        where: { id },
        relations: ['lawyer', 'collaborators'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!dossier) {
        throw new NotFoundException(`Dossier ${id} non trouvé`);
      }
      this.checkDossierAccess(dossier, user);
      if (dossier.status !== DossierStatus.CLOSED) {
        throw new BadRequestException(
          'Seul un dossier clôturé peut être rouvert',
        );
      }
      if (!dossier.procedureInstanceId) {
        throw new BadRequestException(
          'Le dossier ne possède aucune instance procédurale',
        );
      }
      const beforeState = {
        status: dossier.status,
        closingDate: dossier.closing_date,
      };
      dossier.status = DossierStatus.ACTIVE;
      dossier.closing_date = null;
      const saved = await manager.save(dossier);
      const audit = await this.auditService.append(manager, {
        actorId: (user as any)?.id,
        action: 'dossier.reopened',
        resourceType: 'Dossier',
        resourceId: dossier.id,
        dossierId: dossier.id,
        beforeState,
        afterState: {
          status: saved.status,
          closingDate: saved.closing_date,
          procedureInstanceId: saved.procedureInstanceId,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'dossier.reopened',
        aggregateType: 'Dossier',
        aggregateId: dossier.id,
        idempotencyKey: `dossier-reopened:${audit.id}`,
        payload: {
          dossierId: dossier.id,
          actorId: (user as any)?.id,
          instanceId: saved.procedureInstanceId,
          fromStatus: beforeState.status,
          toStatus: saved.status,
        },
      });
    });
    return this.findOne(id, user);
  }

  async archive(id: number, user: User): Promise<DossierResponseDto> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const dossier = await manager.findOne(Dossier, {
        where: { id },
        relations: ['factures', 'lawyer', 'collaborators'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!dossier) {
        throw new NotFoundException(`Dossier ${id} non trouvé`);
      }
      this.checkDossierAccess(dossier, user);
      if (dossier.status !== DossierStatus.CLOSED) {
        throw new BadRequestException(
          'Seul un dossier clôturé peut être archivé',
        );
      }
      const nonTerminalInvoices = (dossier.factures ?? []).filter(
        (facture) => !this.isTerminalInvoice(facture),
      );
      if (nonTerminalInvoices.length > 0) {
        throw new BadRequestException(
          'Impossible d’archiver le dossier : des factures ne sont ni payées ni annulées',
        );
      }

      const beforeState = {
        status: dossier.status,
        closingDate: dossier.closing_date,
      };
      dossier.status = DossierStatus.ARCHIVED;
      dossier.closing_date = dossier.closing_date ?? new Date();
      const saved = await manager.save(dossier);
      const audit = await this.auditService.append(manager, {
        actorId: (user as any)?.id,
        action: 'dossier.archived',
        resourceType: 'Dossier',
        resourceId: dossier.id,
        dossierId: dossier.id,
        beforeState,
        afterState: {
          status: saved.status,
          closingDate: saved.closing_date,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'dossier.archived',
        aggregateType: 'Dossier',
        aggregateId: dossier.id,
        idempotencyKey: `dossier-archived:${audit.id}`,
        payload: {
          dossierId: dossier.id,
          actorId: (user as any)?.id,
          fromStatus: beforeState.status,
          toStatus: saved.status,
        },
      });
    });
    return this.findOne(id, user);
  }

  async getStatistics(user: User): Promise<any> {
    const queryBuilder = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoin('dossier.procedure_type', 'procedure_type')
      .select('procedure_type.name', 'procedure_type')
      .addSelect('COUNT(dossier.id)', 'count')
      .addSelect('AVG(dossier.estimated_duration)', 'avg_duration')
      .groupBy('procedure_type.name');

    // Filtrage par utilisateur
    if (user.role === 'avocat') {
      queryBuilder.where('dossier.lawyer_id = :lawyerId', { lawyerId: user.id });
    }

    const stats = await queryBuilder.getRawMany();

    // Statistiques par statut
    const statusStats = await this.dossierRepository
      .createQueryBuilder('dossier')
      .select('dossier.status', 'status')
      .addSelect('COUNT(dossier.id)', 'count')
      .where(user.role === 'avocat' ? 'dossier.lawyer_id = :lawyerId' : '1=1', { lawyerId: user.id })
      .groupBy('dossier.status')
      .getRawMany();

    return {
      by_procedure_type: stats,
      by_status: statusStats,
      total: await this.dossierRepository.count({
        where: user.role === 'avocat' ? { lawyer: { id: user.id } } : {}
      })
    };
  }

  // Méthodes privées
  private async generateDossierNumber(): Promise<string> {
    const tenantId = getCurrentTenantId();
    const settings = await this.cabinetRepository.findOne({
      where: { id: tenantId },
    });
    const prefix   = (settings?.dossier_prefix ?? 'DOS-').toString();
    const padding  = 4;
    const template = (settings?.dossier_number_format ?? '{PREFIX}{YYYY}-{NNNN}').toString();

    const now  = new Date();
    const YYYY = now.getFullYear().toString();
    const MM   = (now.getMonth() + 1).toString().padStart(2, '0');

    const scopeDescriptor = [
      prefix,
      template,
      template.includes('{YYYY}') ? YYYY : 'ALL_YEARS',
      template.includes('{MM}') ? MM : 'ALL_MONTHS',
    ].join('|');
    const scopeKey = createHash('sha256')
      .update(scopeDescriptor)
      .digest('hex');
    const searchPrefix = template
      .replace('{PREFIX}', prefix)
      .replace('{YYYY}',   YYYY)
      .replace('{MM}',     MM)
      .replace('{NNNN}',   '');
    const nextSeq = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT IGNORE INTO dossier_number_sequences
           (tenant_id, scope_key, next_value)
         VALUES (?, ?, 1)`,
        [tenantId, scopeKey],
      );
      const rows = await manager.query(
        `SELECT next_value
         FROM dossier_number_sequences
         WHERE tenant_id = ? AND scope_key = ?
         FOR UPDATE`,
        [tenantId, scopeKey],
      );
      let sequence = Number(rows?.[0]?.next_value);
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new BadRequestException(
          'La séquence de numérotation des dossiers est invalide',
        );
      }
      const existingRows = await manager.query(
        `SELECT dossier_number
         FROM dossiers
         WHERE tenant_id = ? AND dossier_number LIKE ?
         ORDER BY dossier_number DESC
         LIMIT 1`,
        [tenantId, `${searchPrefix}%`],
      );
      const lastNumber = String(
        existingRows?.[0]?.dossier_number ?? '',
      );
      if (lastNumber.startsWith(searchPrefix)) {
        const match = lastNumber
          .slice(searchPrefix.length)
          .match(/^(\d+)/);
        const lastSequence = match ? Number(match[1]) : 0;
        if (
          Number.isSafeInteger(lastSequence) &&
          sequence <= lastSequence
        ) {
          sequence = lastSequence + 1;
        }
      }
      await manager.query(
        `UPDATE dossier_number_sequences
         SET next_value = ?
         WHERE tenant_id = ? AND scope_key = ?`,
        [sequence + 1, tenantId, scopeKey],
      );
      return sequence;
    });

    const buildNumber = (seq: number) =>
      template
        .replace('{PREFIX}', prefix)
        .replace('{YYYY}',   YYYY)
        .replace('{MM}',     MM)
        .replace('{NNNN}',   seq.toString().padStart(padding, '0'));

    return buildNumber(nextSeq);
  }

  private async validateProcedureTypeSubtype(typeId: number, subtypeId: number): Promise<boolean | null> {
    const subtype = await this.procedureTypeRepository.findOne({
      where: { id: subtypeId },
      relations: ['parent']
    });
    return subtype && Number(subtype.parent_id) === Number(typeId);
  }

  private checkDossierAccess(dossier: Dossier, user: User): void {
    const authUser = user as any;

    // Admin : accès total
    if (authUser.role === UserRole.ADMIN) return;

    // Client : accès uniquement à ses propres dossiers (via customerId du JWT)
    if (authUser.role === UserRole.CLIENT) {
      if (!authUser.customerId || dossier.client_id !== authUser.customerId) {
        throw new ForbiddenException('Accès non autorisé à ce dossier');
      }
      return;
    }

    // Les identifiants Employee et User partagent la même clé primaire.
    const isOwner =
      dossier.lawyer?.user?.id === authUser.id ||
      dossier.lawyer?.id === authUser.id;
    const isCollaborator =
      dossier.collaborators?.some(
        (collaborator) =>
          collaborator.user?.id === authUser.id ||
          collaborator.id === authUser.id,
      ) ?? false;

    if (!isOwner && !isCollaborator) {
      throw new ForbiddenException('Accès non autorisé à ce dossier');
    }
  }

  private mapToResponseDto(dossier: Dossier): DossierResponseDto {
    const response = plainToInstance(DossierResponseDto, {
      ...dossier,
      document_count: dossier.documents?.length || 0,
      audience_count: dossier.audiences?.length || 0,
      facture_count: dossier.factures?.length || 0,
      next_audience: dossier.next_audience ? {
        id: dossier.next_audience.id,
        audience_date: dossier.next_audience.audience_date,
        audience_time: dossier.next_audience.audience_time,
        jurisdiction: dossier.next_audience.jurisdiction
      } : undefined,
      is_active: dossier.is_active,
      is_closed: dossier.is_closed,
      is_archived: dossier.status === DossierStatus.ARCHIVED,
      client: {
        id: dossier.client.id,
        full_name: dossier.client.full_name,
        email: dossier.client.email,
        company_name: dossier.client.company_name
      },
      lawyer: {
        id: dossier.lawyer.id,
        full_name: dossier.lawyer.full_name,
        email: dossier.lawyer.email,
        specialization: dossier.lawyer.specialization
      },
      procedure_type: {
        id: dossier.procedure_type.id,
        name: dossier.procedure_type.name,
        code: dossier.procedure_type.code
      },
      procedure_subtype: {
        id: dossier.procedure_subtype.id,
        name: dossier.procedure_subtype.name,
        code: dossier.procedure_subtype.code
      }
    });

    return response;
  }


async getCollaboratorDossiers(
  collaboratorId: number,
  paginationParams?: PaginationParamsDto
): Promise<DossierResponseDto[] | any> {
  
  // Vérifier l'existence du collaborateur
  const collaborator = await this.userRepository.findOne({
    where: { id: collaboratorId }
  });

  if (!collaborator) {
    throw new NotFoundException(`Collaborateur avec l'ID ${collaboratorId} non trouvé`);
  }

  // Construire la requête de base
  const queryBuilder = this.dossierRepository
    .createQueryBuilder('dossier')
    .leftJoinAndSelect('dossier.collaborators', 'collaborator')
    .leftJoinAndSelect('dossier.client', 'client')
    .leftJoinAndSelect('dossier.lawyer', 'lawyer')
    .leftJoinAndSelect('dossier.procedure_type', 'procedure_type')
    .leftJoinAndSelect('dossier.procedure_subtype', 'procedure_subtype')
    .where('collaborator.id = :collaboratorId', { collaboratorId })
    .orderBy('dossier.created_at', 'DESC');

  // Alternative avec une sous-requête si la première ne fonctionne pas
  // .where(qb => {
  //   const subQuery = qb.subQuery()
  //     .select('dossier.id')
  //     .from(Dossier, 'd')
  //     .leftJoin('d.collaborators', 'c')
  //     .where('c.id = :collaboratorId OR c.id IS NULL')
  //     .getQuery();
  //   return 'dossier.id IN ' + subQuery;
  // }, { collaboratorId })

  // Exécuter la requête
  const dossiers = await queryBuilder.getMany();

  // Garder uniquement les dossiers où le collaborateur est effectivement membre
  const filteredDossiers = dossiers.filter(dossier =>
    dossier.collaborators?.some(c => c.id === collaboratorId)
  );

  // Si aucun dossier trouvé
  if (!filteredDossiers || filteredDossiers.length === 0) {
    // Retourner selon le mode (paginated ou non)
    if (paginationParams?.page && paginationParams?.limit) {
      return {
        data: [],
        meta: {
          total: 0,
          page: paginationParams.page,
          limit: paginationParams.limit,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false
        }
      };
    }
    return [];
  }

  // Si pas de pagination, retourner tout
  if (!paginationParams?.page || !paginationParams?.limit) {
    return Promise.all(filteredDossiers.map(dossier => this.mapToResponseDto(dossier)));
  }

  // Avec pagination (appliquer la pagination sur les résultats filtrés)
  const startIndex = (paginationParams.page - 1) * paginationParams.limit;
  const endIndex = startIndex + paginationParams.limit;
  const paginatedDossiers = filteredDossiers.slice(startIndex, endIndex);
  const total = filteredDossiers.length;

  const dtoDossiers = await Promise.all(
    paginatedDossiers.map(dossier => this.mapToResponseDto(dossier))
  );

  return {
    data: dtoDossiers,
    meta: {
      total,
      page: paginationParams.page,
      limit: paginationParams.limit,
      totalPages: Math.ceil(total / paginationParams.limit),
      hasNextPage: paginationParams.page < Math.ceil(total / paginationParams.limit),
      hasPreviousPage: paginationParams.page > 1
    }
  };
}

/**
 * ➕ Ajouter un collaborateur (Employee) à un dossier.
 *
 * - Charge le dossier avec ses collaborateurs et les relations nécessaires au mapping.
 * - Vérifie que le collaborateur existe et n'est pas déjà associé.
 * - Bloque l'opération si le dossier est clôturé ou archivé.
 */
async addCollaborator(
  dossierId: number,
  employeeId: number,
  user?: User,
): Promise<DossierResponseDto> {
  const empId = Number(employeeId);
  if (!empId || Number.isNaN(empId)) {
    throw new BadRequestException('Le collaborateur (employee_id) est requis');
  }

  const dossier = await this.dossierRepository.findOne({
    where: { id: dossierId },
    relations: ['collaborators', 'client', 'lawyer', 'procedure_type', 'procedure_subtype'],
  });

  if (!dossier) {
    throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
  }

  if (user) {
    this.checkDossierAccess(dossier, user);
  }

  if (dossier.is_closed) {
    throw new BadRequestException(
      "Impossible d'ajouter un collaborateur à un dossier clôturé ou archivé",
    );
  }

  const employee = await this.userRepository.findOne({ where: { id: empId } });
  if (!employee) {
    throw new NotFoundException(`Collaborateur ${empId} non trouvé`);
  }

  dossier.collaborators = dossier.collaborators || [];
  const alreadyLinked = dossier.collaborators.some((c) => c.id === empId);
  if (alreadyLinked) {
    throw new BadRequestException('Ce collaborateur est déjà associé au dossier');
  }

  dossier.collaborators.push(employee);
  const saved = await this.dataSource.transaction(async (manager) => {
    const persisted = await manager.save(dossier);
    const repository = manager.getRepository(DossierMember);
    let member = await repository.findOne({
      where: { dossierId, userId: empId },
    });
    if (!member) {
      member = repository.create({
        dossierId,
        userId: empId,
        role: DossierMemberRole.COLLABORATOR,
        confidentialityLevel: dossier.confidentiality_level ? 1 : 0,
        validFrom: new Date(),
        validUntil: null,
        revokedAt: null,
        revokedBy: null,
      });
    } else {
      member.role = DossierMemberRole.COLLABORATOR;
      member.revokedAt = null;
      member.revokedBy = null;
      member.validUntil = null;
    }
    await repository.save(member);
    const auditEvent = await this.auditService.append(manager, {
      actorId: (user as any)?.id,
      action: 'dossier.member.added',
      resourceType: 'DossierMember',
      resourceId: member.id,
      dossierId,
      afterState: { userId: empId, role: member.role },
    });
    await this.outboxService.enqueue(manager, {
      eventType: 'dossier.member.added',
      aggregateType: 'Dossier',
      aggregateId: dossierId,
      idempotencyKey: `dossier-member-added:${auditEvent.id}`,
      payload: { dossierId, userId: empId },
    });
    return persisted;
  });

  return this.mapToResponseDto(saved);
}

/**
 * ➖ Retirer un collaborateur (Employee) d'un dossier.
 */
async removeCollaborator(
  dossierId: number,
  employeeId: number,
  user?: User,
): Promise<DossierResponseDto> {
  const empId = Number(employeeId);
  if (!empId || Number.isNaN(empId)) {
    throw new BadRequestException('Le collaborateur (employee_id) est requis');
  }

  const dossier = await this.dossierRepository.findOne({
    where: { id: dossierId },
    relations: ['collaborators', 'client', 'lawyer', 'procedure_type', 'procedure_subtype'],
  });

  if (!dossier) {
    throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
  }

  if (user) {
    this.checkDossierAccess(dossier, user);
  }

  if (dossier.is_closed) {
    throw new BadRequestException(
      "Impossible de retirer un collaborateur d'un dossier clôturé ou archivé",
    );
  }

  dossier.collaborators = (dossier.collaborators || []).filter((c) => c.id !== empId);
  const saved = await this.dataSource.transaction(async (manager) => {
    const persisted = await manager.save(dossier);
    const repository = manager.getRepository(DossierMember);
    const member = await repository.findOne({
      where: { dossierId, userId: empId },
    });
    if (member && !member.revokedAt) {
      member.revokedAt = new Date();
      member.revokedBy = Number((user as any)?.id) || null;
      await repository.save(member);
      const auditEvent = await this.auditService.append(manager, {
        actorId: (user as any)?.id,
        action: 'dossier.member.revoked',
        resourceType: 'DossierMember',
        resourceId: member.id,
        dossierId,
        beforeState: { userId: empId, revokedAt: null },
        afterState: { userId: empId, revokedAt: member.revokedAt },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'dossier.member.revoked',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        idempotencyKey: `dossier-member-revoked:${auditEvent.id}`,
        payload: {
          dossierId,
          userId: empId,
          revokeRealtimeAccess: true,
          removeFromConversation: true,
        },
      });
    }
    return persisted;
  });

  return this.mapToResponseDto(saved);
}

/**
 * 🔄 Synchroniser la liste complète des collaborateurs d'un dossier.
 * Remplace l'ensemble des collaborateurs par la liste fournie.
 */
async syncCollaborators(
  dossierId: number,
  employeeIds: number[],
  user?: User,
): Promise<DossierResponseDto> {
  const dossier = await this.dossierRepository.findOne({
    where: { id: dossierId },
    relations: ['collaborators', 'client', 'lawyer', 'procedure_type', 'procedure_subtype'],
  });

  if (!dossier) {
    throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
  }

  if (user) {
    this.checkDossierAccess(dossier, user);
  }

  if (dossier.is_closed) {
    throw new BadRequestException(
      "Impossible de modifier les collaborateurs d'un dossier clôturé ou archivé",
    );
  }

  // Charger les employees correspondants
  const employees = employeeIds.length > 0
    ? await this.userRepository.find({
        where: employeeIds.map((id) => ({ id })),
      })
    : [];
  const requestedEmployeeIds = [...new Set(employeeIds.map(Number))];
  if (employees.length !== requestedEmployeeIds.length) {
    throw new BadRequestException(
      'Un ou plusieurs collaborateurs sont inconnus du cabinet',
    );
  }

  dossier.collaborators = employees;
  const saved = await this.dataSource.transaction(async (manager) => {
    const persisted = await manager.save(dossier);
    const repository = manager.getRepository(DossierMember);
    const currentMembers = await repository.find({
      where: { dossierId, role: DossierMemberRole.COLLABORATOR },
    });
    const desired = new Set(requestedEmployeeIds);
    const changed: Array<Record<string, any>> = [];
    for (const member of currentMembers) {
      if (!desired.has(member.userId) && !member.revokedAt) {
        member.revokedAt = new Date();
        member.revokedBy = Number((user as any)?.id) || null;
        await repository.save(member);
        changed.push({ userId: member.userId, action: 'REVOKED' });
      }
    }
    for (const employeeId of desired) {
      let member = currentMembers.find((item) => item.userId === employeeId);
      if (!member) {
        member = repository.create({
          dossierId,
          userId: employeeId,
          role: DossierMemberRole.COLLABORATOR,
          confidentialityLevel: dossier.confidentiality_level ? 1 : 0,
          validFrom: new Date(),
          validUntil: null,
          revokedAt: null,
          revokedBy: null,
        });
        changed.push({ userId: employeeId, action: 'ADDED' });
      } else if (member.revokedAt) {
        member.revokedAt = null;
        member.revokedBy = null;
        member.validUntil = null;
        changed.push({ userId: employeeId, action: 'RESTORED' });
      }
      member.confidentialityLevel = dossier.confidentiality_level ? 1 : 0;
      await repository.save(member);
    }
    if (changed.length > 0) {
      const auditEvent = await this.auditService.append(manager, {
        actorId: (user as any)?.id,
        action: 'dossier.members.synchronized',
        resourceType: 'Dossier',
        resourceId: dossierId,
        dossierId,
        afterState: { members: requestedEmployeeIds, changes: changed },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'dossier.members.synchronized',
        aggregateType: 'Dossier',
        aggregateId: dossierId,
        idempotencyKey: `dossier-members-synchronized:${auditEvent.id}`,
        payload: {
          dossierId,
          changes: changed,
          revokeRealtimeAccess: true,
          synchronizeConversation: true,
        },
      });
    }
    return persisted;
  });

  return this.mapToResponseDto(saved);
}

/**
   * Uploade un fichier, crée le DocumentCustomer et le lie à la visite de sous-étape.
   *
   * Résolution des IDs :
   *  - dossier_id  → paramètre dossierId
   *  - customer_id → client du dossier (dossier.client.id)
   *  - sub_stage_visit_id / stage_visit_id → depuis dto (priorité) ou visite courante
   */
  async uploadDocumentToSubStage(
    dossierId: number,
    dto: UploadDocumentToSubStageDto,
    file: Express.Multer.File,
    user: any,
  ) {
    // 1. Charger le dossier pour récupérer le client et éventuellement la visite courante
    const dossier = await this.findOne(dossierId, user);
    if (!((dossier as any).client?.id ?? (dossier as any).client_id)) {
      throw new Error(`Dossier #${dossierId} : client introuvable`);
    }

    // 2. Résoudre les IDs de visite : DTO > visite courante automatique
    let subStageVisitId = dto.sub_stage_visit_id;
    let stageVisitId    = dto.stage_visit_id;

    if (!subStageVisitId || !stageVisitId) {
      const currentVisit = await this.getCurrentStageVisit(dossier as any);
      if (currentVisit) {
        subStageVisitId ??= currentVisit.currentSubStageVisitId ?? undefined;
        stageVisitId    ??= currentVisit.id;
      }
    }

    // 3. Créer le document (l'upload physique est géré par DocumentCustomerService)
    const created = await this.documentVersionService.createDocument(
      {
        document_type_id: dto.document_type_id,
        category_id:      dto.category_id,
        dossier_id:       dossierId,
        name:             dto.name,
        description:      dto.description,
        is_confidential:  dto.is_confidential,
        strict:           true,
        stage_visit_id:     stageVisitId,
        sub_stage_visit_id: subStageVisitId,
        file,
      },
      file,
      Number(user?.id),
    );

    // 4. Lier le document à la visite de sous-étape (table sub_stage_visit_documents)
    return created;
  }

async getCurrentStageVisit(dossier: Dossier): Promise<StageVisit | null> {
  if(dossier?.procedureInstanceId)
    return await this.procedureInstanceService.getCurrentStageVisit(dossier?.procedureInstanceId)
  return null
}

async closeDossier(
  id: number,
  user: User,
  closeDto: CloseDossierDto,
): Promise<DossierResponseDto> {
  await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
    const dossier = await manager.findOne(Dossier, {
      where: { id },
      relations: [
        'client',
        'lawyer',
        'collaborators',
        'audiences',
        'factures',
      ],
      lock: { mode: 'pessimistic_write' },
    });
    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }
    this.checkDossierAccess(dossier, user);
    if (dossier.status !== DossierStatus.ACTIVE) {
      throw new BadRequestException(
        `Seul un dossier actif peut être clôturé (cycle actuel : ${dossier.status})`,
      );
    }

    const violations: string[] = [];
    if (!dossier.procedureInstanceId) {
      violations.push('aucune instance procédurale n’est rattachée');
    } else {
      const instance = await manager.findOne(ProcedureInstance, {
        where: { id: dossier.procedureInstanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!instance) {
        violations.push('l’instance procédurale rattachée est introuvable');
      } else if (instance.status !== InstanceStatus.COMPLETED) {
        violations.push(`l’instance procédurale est ${instance.status}`);
      }
    }

    if (
      dossier.audiences?.some(
        (audience) => audience.status === AudienceStatus.SCHEDULED,
      )
    ) {
      violations.push('au moins une audience est encore programmée');
    }
    if (
      dossier.factures?.some(
        (facture) => !this.isTerminalInvoice(facture),
      )
    ) {
      violations.push(
        'au moins une facture n’est ni payée ni annulée',
      );
    }
    if (
      !(dossier.factures ?? []).some(
        (facture) => facture.nature === InvoiceNature.FINAL,
      )
    ) {
      violations.push('la facture finale du dossier est manquante');
    }
    if (!closeDto.outcome_notes?.trim()) {
      violations.push('le rapport final est manquant');
    }
    if (
      [DossierOutcome.WON, DossierOutcome.LOST].includes(closeDto.outcome) &&
      !closeDto.final_decision_text?.trim()
    ) {
      violations.push('la décision finale est manquante');
    }

    const permissions: string[] = (user as any)?.permissions ?? [];
    const overrideReason = closeDto.override_reason?.trim();
    const canOverride =
      closeDto.force === true &&
      permissions.includes('override_dossier_closure') &&
      !!overrideReason;
    if (violations.length > 0 && !canOverride) {
      throw new BadRequestException({
        message: 'Les préconditions de clôture ne sont pas satisfaites',
        violations,
      });
    }

    const beforeState = {
      status: dossier.status,
      outcome: dossier.outcome ?? null,
      closingDate: dossier.closing_date ?? null,
    };
    this.applyClosureData(dossier, closeDto);
    const saved = await manager.save(dossier);
    const audit = await this.auditService.append(manager, {
      actorId: (user as any)?.id,
      action: canOverride
        ? 'dossier.closed.with_override'
        : 'dossier.closed',
      resourceType: 'Dossier',
      resourceId: dossier.id,
      dossierId: dossier.id,
      beforeState,
      afterState: {
        status: saved.status,
        outcome: saved.outcome,
        closingDate: saved.closing_date,
        violations,
        overrideReason: canOverride ? overrideReason : null,
      },
      justification: canOverride ? overrideReason : undefined,
    });
    await this.outboxService.enqueue(manager, {
      eventType: 'dossier.closed',
      aggregateType: 'Dossier',
      aggregateId: dossier.id,
      idempotencyKey: `dossier-closed:${audit.id}`,
      payload: {
        dossierId: dossier.id,
        actorId: (user as any)?.id,
        sendReportToClient: closeDto.send_report_to_client === true,
        overridden: canOverride,
        fromStatus: beforeState.status,
        toStatus: saved.status,
      },
    });
  });

  return this.findOne(id, user);
}

private applyClosureData(
  dossier: Dossier,
  closeDto: CloseDossierDto,
): void {
  dossier.status = DossierStatus.CLOSED;
  dossier.closing_date = new Date();
  dossier.outcome = closeDto.outcome;
  dossier.outcome_date = closeDto.outcome_date
    ? new Date(closeDto.outcome_date)
    : new Date();
  dossier.outcome_notes = closeDto.outcome_notes.trim();
  dossier.final_decision = closeDto.final_decision_text?.trim() || null;
  if (closeDto.client_satisfaction !== undefined) {
    dossier.client_satisfaction = closeDto.client_satisfaction;
  }

  dossier.damages_awarded =
    closeDto.outcome === DossierOutcome.WON
      ? (closeDto.damages_awarded ?? 0)
      : 0;
  dossier.costs_awarded =
    closeDto.outcome === DossierOutcome.WON
      ? (closeDto.costs_awarded ?? 0)
      : 0;
  dossier.settlement_amount =
    closeDto.outcome === DossierOutcome.SETTLED
      ? (closeDto.settlement_amount ?? 0)
      : 0;
  dossier.settlement_terms =
    closeDto.outcome === DossierOutcome.SETTLED
      ? (closeDto.settlement_terms?.trim() ?? '')
      : '';
}

private isTerminalInvoice(
  invoice: { status: StatutFacture; nature?: InvoiceNature },
): boolean {
  if (invoice.nature === InvoiceNature.CREDIT_NOTE) {
    return [StatutFacture.VALIDEE, StatutFacture.ANNULEE].includes(
      invoice.status,
    );
  }
  return [StatutFacture.PAYEE, StatutFacture.ANNULEE].includes(invoice.status);
}



// *******************************************************





// src/modules/dossiers/dossiers.service.ts
// Ajoute ces méthodes après la méthode update() ou dans une section dédiée

/**
 * 🔒 Clôturer le dossier
 */
// Dans dossiers.service.ts
private async closeDossierLegacy(
  id: number, 
  user: User,
  closeDto: CloseDossierDto
): Promise<DossierResponseDto> {
  void id;
  void user;
  void closeDto;
  throw new ForbiddenException(
    'La clôture historique non transactionnelle est désactivée',
  );

  /*
  const dossier = await this.dossierRepository.findOne({
    where: { id },
    relations: [
      'client',
      'lawyer',
      'collaborators',
      'procedureInstance',
      'audiences',
      'factures',
    ],
  });

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  const violations: string[] = [];
  let instance: ProcedureInstance | null = null;
  if (!dossier.procedureInstanceId) {
    violations.push('aucune instance procédurale n’est rattachée');
  } else {
    instance = await this.procedureInstanceService.findOne(dossier.procedureInstanceId);
    if (instance.status !== InstanceStatus.COMPLETED) {
      violations.push(`l’instance procédurale est ${instance.status}`);
    }
    if (instance.remainingMandatorySubStagesCount > 0) {
      violations.push(
        `${instance.remainingMandatorySubStagesCount} exigence(s) procédurale(s) obligatoire(s) restent à satisfaire`,
      );
    }
  }

  if (dossier.audiences?.some((audience) => audience.status === AudienceStatus.SCHEDULED)) {
    violations.push('au moins une audience est encore programmée');
  }
  if (dossier.factures?.some((facture) => facture.status === StatutFacture.BROUILLON)) {
    violations.push('au moins une facture est encore au brouillon');
  }
  if (!closeDto.outcome_notes?.trim()) {
    violations.push('le rapport final est manquant');
  }
  if (
    [DossierOutcome.WON, DossierOutcome.LOST].includes(closeDto.outcome) &&
    !closeDto.final_decision_text?.trim()
  ) {
    violations.push('la décision finale est manquante');
  }

  if (violations.length > 0) {
    const permissions: string[] = (user as any)?.permissions ?? [];
    const canOverride =
      closeDto.force === true &&
      permissions.includes('override_dossier_closure') &&
      !!closeDto.override_reason?.trim();
    if (!canOverride) {
      throw new BadRequestException({
        message: 'Les préconditions de clôture ne sont pas satisfaites',
        violations,
      });
    }
  }

  // Vérifier si le dossier peut être clôturé
  const closableStatuses = [
    DossierStatus.ACTIVE,
    DossierStatus.CLOSED,
  ];

  if (!closableStatuses.includes(dossier.status)) {
    throw new BadRequestException(
      `Impossible de clôturer le dossier. Statut actuel: ${dossier.status}. ` +
      `Statuts autorisés: ${closableStatuses.join(', ')}`
    );
  }

  // Si déjà clôturé, on met juste à jour le résultat
  const wasAlreadyClosed = dossier.status === DossierStatus.CLOSED;

  // Mettre à jour les informations de clôture
  dossier.status = DossierStatus.CLOSED;
  dossier.closing_date = new Date();
  
  // Mettre à jour le résultat du dossier
  dossier.outcome = closeDto.outcome;
  dossier.outcome_date = closeDto.outcome_date || new Date();
  dossier.outcome_notes = closeDto.outcome_notes || '';
  
  // Gestion des champs selon le type de résultat
  if (closeDto.outcome === DossierOutcome.WON) {
    // Dossier gagné
    if (closeDto.damages_awarded !== undefined) {
      dossier.damages_awarded = closeDto.damages_awarded;
    }
    
    if (closeDto.costs_awarded !== undefined) {
      dossier.costs_awarded = closeDto.costs_awarded;
    }
    
    // Réinitialiser les champs non pertinents
    dossier.settlement_amount = null;
    dossier.settlement_terms = null;
    
  } else if (closeDto.outcome === DossierOutcome.LOST) {
    // Dossier perdu
    // Réinitialiser les champs non pertinents
    dossier.damages_awarded = 0;
    dossier.costs_awarded = 0;
    dossier.settlement_amount = 0;
    dossier.settlement_terms = '';
    
  } else if (closeDto.outcome === DossierOutcome.SETTLED) {
    // Transaction
    if (closeDto.settlement_amount !== undefined) {
      dossier.settlement_amount = closeDto.settlement_amount;
    }
    
    if (closeDto.settlement_terms) {
      dossier.settlement_terms = closeDto.settlement_terms;
    }
    
    // Réinitialiser les champs non pertinents
    dossier.damages_awarded = 0;
    dossier.costs_awarded = 0;
    
  } else if (closeDto.outcome === DossierOutcome.ABANDONED) {
    // Dossier abandonné
    // Réinitialiser tous les champs de résultat
    dossier.damages_awarded = 0;
    dossier.costs_awarded = 0;
    dossier.settlement_amount = 0;
    dossier.settlement_terms = '';
  }
  
  // Gestion de la décision finale (commun à tous)
  if (closeDto.final_decision_text) {
    dossier.final_decision = closeDto.final_decision_text;
  }
  
  // Gestion de la satisfaction client
  if (closeDto.client_satisfaction) {
    dossier.client_satisfaction = closeDto.client_satisfaction;
  }
  
  // Envoi du rapport au client (à traiter séparément)
  if (closeDto.send_report_to_client) {
    try {
      await this.sendClosureReport(dossier, user);
    } catch (error) {
      console.error('Erreur lors de l\'envoi du rapport:', error);
      // Ne pas bloquer la clôture si l'envoi échoue
    }
  }

  // Log l'action
  await this.logDossierClosure(dossier, user, wasAlreadyClosed);

  await this.dossierRepository.save(dossier);
  
  // Déclencher des événements
  // await this.eventEmitter.emit('dossier.closed', { 
  //   dossier: savedDossier, 
  //   user,
  //   wasAlreadyClosed 
  // });
  
  return this.findOne(id, user);
  */
}


// Méthodes auxiliaires privées
private async logDossierClosure(
  dossier: Dossier, 
  user: User, 
  wasAlreadyClosed: boolean
): Promise<void> {
  // Créer un log de l'action
  const logMessage = wasAlreadyClosed 
    ? `Mise à jour du résultat du dossier ${dossier.dossier_number} (${dossier.outcome}) par ${user.full_name}`
    : `Clôture du dossier ${dossier.dossier_number} avec résultat ${dossier.outcome} par ${user.full_name}`;
  
  // Sauvegarder le log (à implémenter selon votre système de logging)
  console.log(logMessage);
  
  // Optionnel: Sauvegarder dans une table de logs
  // await this.logRepository.save({
  //   action: wasAlreadyClosed ? 'UPDATE_OUTCOME' : 'CLOSE_DOSSIER',
  //   dossier_id: dossier.id,
  //   user_id: user.id,
  //   message: logMessage,
  //   metadata: {
  //     outcome: dossier.outcome,
  //     outcome_date: dossier.outcome_date,
  //     damages_awarded: dossier.damages_awarded,
  //     costs_awarded: dossier.costs_awarded
  //   },
  //   created_at: new Date()
  // });
}

private async sendClosureReport(dossier: Dossier, user: User): Promise<void> {
  // Implémenter l'envoi d'email au client
  // Exemple:
  // await this.emailService.sendClosureReport({
  //   to: dossier.client.email,
  //   subject: `Clôture du dossier ${dossier.dossier_number}`,
  //   template: 'dossier-closure',
  //   data: {
  //     dossier_number: dossier.dossier_number,
  //     client_name: dossier.client.full_name,
  //     outcome: dossier.outcome,
  //     outcome_date: dossier.outcome_date,
  //     damages_awarded: dossier.damages_awarded,
  //     final_decision: dossier.final_decision,
  //     lawyer_name: user.full_name
  //   }
  // });
}

async getStageVisits(dossierId: number) {
  const dossier = await this.repository.findOne({where: {id: dossierId}, relations: ['client', 'lawyer','collaborators']});
  if(!dossier?.procedureInstanceId) {
    throw new NotFoundException(`Dossier ${dossierId} n'a pas de procedure`);
  }
  const workflow = await this.procedureInstanceService.getStageVisitHistory(dossier?.procedureInstanceId);
  const responseDossierDto = plainToInstance(DossierResponseDto, dossier);
  return {
    ...responseDossierDto,
    workflow
  }
}

/**
 * Retourne la liste simplifiée des StageVisit d'un dossier pour les selects de formulaire.
 * Format : { data: [{ id, label, visitNumber, stageName, enteredAt, isActive }] }
 */
async getStageVisitsForSelect(dossierId: number): Promise<any[] > {
  const dossier = await this.repository.findOne({ where: { id: dossierId } });
  if (!dossier?.procedureInstanceId) {
    return  [];
  }

  const visits = await this.procedureInstanceService.getStageVisitHistory(dossier.procedureInstanceId);

  const data = visits.map((v: any) => ({
    id:          v.id,
    label:       `${v.stage?.name ?? 'Étape'} — visite #${v.visitNumber}`,
    visitNumber: v.visitNumber,
    stageName:   v.stage?.name ?? null,
    enteredAt:   v.enteredAt,
    isActive:    !v.exitedAt,
    badge:       !v.exitedAt ? 'En cours' : 'Terminée', 
  }));

  return  data ;
}

/**
 * Retourne la liste simplifiée des SubStageVisit d'une StageVisit pour les selects de formulaire.
 * Format : { data: [{ id, label, subStageName, isCompleted, startedAt }] }
 */
async getSubStageVisitsForSelect(dossierId: number, stageVisitId: string): Promise<  any[] > {
  const dossier = await this.repository.findOne({ where: { id: dossierId } });
  if (!dossier?.procedureInstanceId) {
    return [] ;
  }

  const visits = await this.procedureInstanceService.getStageVisitHistory(dossier.procedureInstanceId);
  const stageVisit = visits.find((v: any) => v.id === stageVisitId);

  if (!stageVisit) {
    return [] ;
  }

  const data = (stageVisit.subStageVisits ?? []).map((ssv: any) => ({
    id:           ssv.id,
    label:        `${ssv.subStage?.name ?? 'Sous-étape'} ${ssv.isCompleted ? '✓' : ''}`.trim(),
    subStageName: ssv.subStage?.name ?? null,
    isCompleted:  ssv.isCompleted,
    startedAt:    ssv.startedAt,
    badge:        ssv.isCompleted ? 'Complétée' : 'En cours',
  }));

  return data ;
}


}
