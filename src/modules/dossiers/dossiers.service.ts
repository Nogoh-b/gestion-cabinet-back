// src/modules/dossiers/dossiers.service.ts
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { ClientDecision, DossierStatus, RecommendationType } from 'src/core/enums/dossier-status.enum';
import { UserRole } from 'src/core/enums/user-role.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { PaginatedResult, PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { SearchFilter, SearchUtils } from 'src/core/shared/utils/search.utils';
import { Repository, In, Between, FindOptionsWhere } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { Employee } from '../agencies/employee/entities/employee.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { User } from '../iam/user/entities/user.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { DangerLevel, Dossier, DossierOutcome } from './entities/dossier.entity';
import { ChatService } from '../chat/services/chat/chat.service';
import { CreateConversationDto } from '../chat/dto/create-conversation.dto';
import { MailService } from 'src/core/shared/emails/emails.service';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { StepsService } from './step.service';
import { Step, StepStatus, StepType } from './entities/step.entity';
import { ProcedureInstanceService } from '../procedure/services/procedure-instance.service';
import { CreateProcedureInstanceDto } from '../procedure/dto/create-procedure-instance.dto';
import { StageVisit } from '../procedure/entities/stage-visit.entity';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { CloseDossierDto } from './dto/close-dossier.dto';
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
    protected readonly documentCustomerService: DocumentCustomerService,
    protected readonly chatService: ChatService,
    protected readonly stepsService: StepsService,
    private procedureInstanceService: ProcedureInstanceService,
    protected readonly emailsService?: MailService, // Optionnel
    

  ) {
    super(dossierRepository, paginationService, emailsService);

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
    // console.log(createDossierDto, createdBy);
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
      this.procedureTypeRepository.findOne({ where: { id: createDossierDto.procedure_type_id } }),
      this.procedureTypeRepository.findOne({ where: { id: createDossierDto.procedure_subtype_id }, relations: ['procedure_template'] }),
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

    let procedureInstanceDTO = new CreateProcedureInstanceDto();
    procedureInstanceDTO.templateId = procedureSubtype.procedure_template?.id || procedureType.procedure_template?.id;
    procedureInstanceDTO.title = createDossierDto.dossier_number;

    const procedureInstance = await this.procedureInstanceService.create(procedureInstanceDTO, createdBy.id.toString())

    const dossier = this.dossierRepository.create({
      ...createDossierDto,
      dossier_number: dossierNumber,
      client,
      lawyer,
      jurisdiction_id : createDossierDto.jurisdiction ?? 1,
      jurisdiction: {id : createDossierDto.jurisdiction ?? 1} as Jurisdiction,
      procedure_type: procedureType,
      procedure_subtype: procedureSubtype,
      procedureInstance,
      opening_date: createDossierDto.opening_date ? new Date(createDossierDto.opening_date) : new Date(),
      status: DossierStatus.OPEN,
    });

    // Gestion des collaborateurs
    if (createDossierDto.collaborator_ids && createDossierDto.collaborator_ids.length > 0) {
      const collaborators = await this.userRepository.find({
        where: { id: In(createDossierDto.collaborator_ids) }
      });
      dossier.collaborators = collaborators;
    }

    let conversationDto = new CreateConversationDto()
    const users = await this.userRepository.find({
      // select: ['id'],
      relations : ['user']
    });
    conversationDto.participantIds = dossier.collaborators?.length  > 0 ? createDossierDto.collaborator_ids : users.map(u => u.id)
    const conversation = await this.chatService.createConversation(conversationDto, createdBy.id)
    dossier.conversation = conversation;
    console.log('DTO:', JSON.stringify(createDossierDto, null, 2));
    console.log('Entity before save:', dossier);
    const savedDossier = await this.dossierRepository.save(dossier);
    let mailDto = new CreateMailDto() 
    const dossierR = await this.mapToResponseDto(savedDossier);
    mailDto.templateName = "entities/dossier/dossier-created-creator"
    mailDto.context = dossierR
    mailDto.to = users.map(u => u.email)
    mailDto.subject = "Creation d'un nouveau dossier"
    this.sendMail(mailDto)
    return dossierR
  }

  async findAll(searchDto: DossierSearchDto, user: User): Promise<any[]> {

    const dossiers = await this.dossierRepository.find({
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

    
    return dossiers
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

    // Filtrage par rôle
    if (user.role === UserRole.AVOCAT) {
      conditions.push({ lawyer: { id: user.id } });
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
  console.log(id);
  
  // ✅ Charger UNIQUEMENT le dossier avec ses relations directes
  const dossier = await this.dossierRepository.findOne({
    where: { id },
    relations: [
      'client',
      'lawyer',
      'lawyer.user',
      'factures',
      'procedure_type',
      'procedureInstance',
      'procedure_subtype',
      'jurisdiction',
    ],
  });

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  // ✅ Charger procedureInstance séparément si nécessaire
  if (dossier.procedureInstanceId) {
    const procedureInstance = await this.procedureInstanceService.getWorkflowStatus(dossier.procedureInstanceId);
    
    if (procedureInstance) {
      dossier.procedureInstance = procedureInstance;
      
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


    /* =============================
    * Validation type / sous-type
    * ============================= */
    if (
      updateDossierDto.procedure_type_id &&
      updateDossierDto.procedure_subtype_id
    ) {
      const isValidPair = await this.validateProcedureTypeSubtype(
        updateDossierDto.procedure_type_id,
        updateDossierDto.procedure_subtype_id
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
    if (updateDossierDto.status) {
      dossier.status = updateDossierDto.status;
    }

    /* =============================
    * Collaborateurs
    * ============================= */
    if (updateDossierDto.collaborator_ids) {
      if (updateDossierDto.collaborator_ids.length === 0) {
        dossier.collaborators = [];
      } else {
        const collaborators = await this.userRepository.find({
          where: { id: In(updateDossierDto.collaborator_ids) },
        });
        dossier.collaborators = collaborators;
      }
    }

    /* =============================
    * Champs simples (merge)
    * ============================= */
    Object.assign(dossier, {
      ...updateDossierDto,
      dossier_number: dossier.dossier_number, // protection
    });
    console.log(updateDossierDto, dossier);
    dossier.confidentiality_level = (dossier.confidentiality_level);
    const updatedDossier = await this.dossierRepository.save(dossier);
    return this.mapToResponseDto(updatedDossier);
  }


  async changeStatus(id: number, changeStatusDto: ChangeStatusDto, user: User): Promise<DossierResponseDto> {
    const dossier = await this.dossierRepository.findOne({
      where: { id },
      relations: ['client', 'lawyer', 'procedure_type', 'procedure_subtype']
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }

    this.checkDossierAccess(dossier, user);

    try {
      dossier.change_status(changeStatusDto.status);
      
      if (changeStatusDto.final_decision) {
        dossier.final_decision = changeStatusDto.final_decision;
      }

      const updatedDossier = await this.dossierRepository.save(dossier);
      return this.mapToResponseDto(updatedDossier);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async remove(id: number, user: User): Promise<void> {
    const dossier = await this.dossierRepository.findOne({ where: { id } });

    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }

    // this.checkDossierAccess(dossier, user);

    // Vérifier si le dossier peut être supprimé
    if (dossier.is_closed || dossier.is_archived) {
      throw new BadRequestException('Impossible de supprimer un dossier clôturé ou archivé');
    }

    await this.dossierRepository.softDelete(id);
  }

  async archive(id: number, user: User): Promise<DossierResponseDto> {
    const dossier = await this.dossierRepository.findOne({
      where: { id },
      relations: ['factures']
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }

    this.checkDossierAccess(dossier, user);

    // Vérifier que toutes les factures sont payées (R5)
    const unpaidFactures = dossier.factures.filter(facture => facture.montantPaye <= 0);
    if (unpaidFactures.length > 0) {
      throw new BadRequestException('Impossible d\'archiver le dossier: des factures sont impayées');
    }

    dossier.status = DossierStatus.ARCHIVED;
    dossier.closing_date = new Date();

    const archivedDossier = await this.dossierRepository.save(dossier);
    return this.mapToResponseDto(archivedDossier);
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
    const year = new Date().getFullYear();
    const count = await this.dossierRepository.count({
      where: {
        created_at: Between(new Date(`${year}-01-01`), new Date(`${year}-12-31`))
      }
    });
    
    const sequence = (count + 1).toString().padStart(4, '0');
    return `DOS-${year}-${sequence}-${randomUUID().slice(0, 4).toUpperCase()}`; 
  }

  private async validateProcedureTypeSubtype(typeId: number, subtypeId: number): Promise<boolean | null> {
    console.log(typeId, subtypeId);
    const subtype = await this.procedureTypeRepository.findOne({
      where: { id: subtypeId },
      relations: ['parent']
    });
    console.log(subtype?.parent_id ,'===', typeId);

    return subtype && Number(subtype.parent_id) === Number(typeId);
  }

  private checkDossierAccess(dossier: Dossier, user: User): void {
    const isOwner = dossier.lawyer.id === user.id;
    const isCollaborator = dossier.collaborators?.some(collab => collab.id === user.id);
    const isAdmin = user.role === 'admin';
    const isClient = dossier.client.id === user.id;

    if (!isOwner && !isCollaborator && !isAdmin && !isClient) { 
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
      is_archived: dossier.is_archived,
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
    .where('collaborator.id = :collaboratorId OR collaborator.id IS NULL', { collaboratorId })
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

  // Filtrer pour ne garder que les dossiers où le collaborateur est présent
  // OU les dossiers sans aucun collaborateur
  const filteredDossiers = dossiers.filter(dossier => {
    // Si le dossier n'a pas de collaborateurs, on le garde
    if (!dossier.collaborators || dossier.collaborators.length === 0) {
      return true;
    }
    // Si le dossier a des collaborateurs, on vérifie si le collaborateur recherché en fait partie
    return dossier.collaborators.some(c => c.id === collaboratorId);
  });

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

async linkDocumentsToSubStage(  documentIds: number[], dossierId: any, userId: any): Promise<DossierResponseDto | null> {
  const dossier = await this.findOne(dossierId)
  const currentStage = await this.getCurrentStageVisit(dossier);
  console.log('Current SubStage:', dossierId,' ', documentIds, ' ', currentStage);
  await this.documentCustomerService.linkDocumentsToSubStage(documentIds, currentStage?.currentSubStageVisitId || 0)
  return plainToInstance(DossierResponseDto, dossier);
}
async getCurrentStageVisit(dossier: Dossier): Promise<StageVisit | null> {
  console.log('Getting current stage visit for dossier:', dossier?.procedureInstanceId);
  if(dossier?.procedureInstanceId)
    return await this.procedureInstanceService.getCurrentStageVisit(dossier?.procedureInstanceId)
  return null
}



// *******************************************************





// src/modules/dossiers/dossiers.service.ts
// Ajoute ces méthodes après la méthode update() ou dans une section dédiée

/**
 * 📊 Analyse préliminaire du dossier
 */
async performPreliminaryAnalysis(
  id: number, 
  successProbability: number, 
  dangerLevel: DangerLevel, 
  notes: string,
  user: User
): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // Vérifier que le dossier est dans un état valide pour l'analyse
  if (dossier.status !== DossierStatus.OPEN && dossier.status !== DossierStatus.PRELIMINARY_ANALYSIS) {
    throw new BadRequestException(`L'analyse préliminaire ne peut être effectuée sur un dossier en statut ${dossier.status}`);
  }

  // Effectuer l'analyse
  dossier.success_probability = successProbability;
  dossier.danger_level = dangerLevel;
  dossier.analysis_notes = notes;
  dossier.analysis_date = new Date();
  dossier.status = DossierStatus.PRELIMINARY_ANALYSIS;

  // Générer la recommandation
  if (successProbability < 30) {
    console.log(RecommendationType.TRANSACTION, ' ',successProbability)
    dossier.recommendation = RecommendationType.TRANSACTION;
  } else if (successProbability <= 70) {
    console.log(RecommendationType.PRESENT_OPTIONS, ' ',successProbability)
    dossier.recommendation = RecommendationType.PRESENT_OPTIONS;
  } else {
    console.log(RecommendationType.PROCEDURE, ' ',successProbability)
    dossier.recommendation = RecommendationType.PROCEDURE;
  }

  const savedDossier = await this.dossierRepository.save(dossier);

  // Créer automatiquement l'étape d'analyse
  await this.createAnalysisStep(savedDossier);

  return this.mapToResponseDto(savedDossier);
}

/**
 * 🤝 Enregistrer la décision du client
 */

async processClientDecision(
  id: number,
  decision: ClientDecision,
  user: User
): Promise<DossierResponseDto> {
  // Utilisez findOneV1 comme dans performPreliminaryAnalysis
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // Vérifier que le dossier a été analysé
  if (dossier.status !== DossierStatus.PRELIMINARY_ANALYSIS && !dossier.recommendation) {
    throw new BadRequestException('Le dossier doit d\'abord être analysé avant de prendre une décision');
  }

  dossier.client_decision = decision;
  
  // SAUVEGARDER le dossier d'abord (comme dans performPreliminaryAnalysis)
  switch (decision) {
    case 'transaction':
      dossier.status = DossierStatus.AMICABLE;
      break;
    case 'contentieux':
      dossier.status = DossierStatus.LITIGATION;
      break;
    case 'abandon':
      dossier.status = DossierStatus.ABANDONED;
      dossier.closing_date = new Date();
      break;
  }
  const savedDossier = await this.dossierRepository.save(dossier);
  
  // Ensuite créer l'étape avec le dossier sauvegardé
  switch (decision) {
    case 'transaction':
      dossier.status = DossierStatus.AMICABLE;
      await this.createAmicableStep(savedDossier);
      break;
    case 'contentieux':
      dossier.status = DossierStatus.LITIGATION;
      await this.createContentiousStep(savedDossier);
      break;
    case 'abandon':
      dossier.status = DossierStatus.ABANDONED;
      dossier.closing_date = new Date();
      await this.createAbandonmentStep(savedDossier);
      break;
  }
  // const savedDossierFinal = await this.dossierRepository.save(dossier);

  return this.mapToResponseDto(savedDossier);
}

private async createAmicableStep(dossier: Dossier): Promise<void> {
  // Reproduire exactement la même structure que createAnalysisStep
  const step = new Step();
  step.dossier = dossier;  // dossier est déjà sauvegardé
  step.type = StepType.AMIABLE;
  step.title = 'Phase transactionnelle';
  step.description = 'Négociation avec la partie adverse';
  step.status = StepStatus.IN_PROGRESS;
  step.metadata = {
    type: 'AMICABLE',
    startDate: new Date(),
    recommendation: dossier.recommendation
  };

  await this.stepsService.createStepFromEntity(dossier.id, step);
}

private async createContentiousStep(dossier: Dossier): Promise<void> {
  const step = new Step();
  step.dossier = dossier;
  step.type = StepType.CONTENTIOUS;
  step.title = 'Phase contentieuse';
  step.description = 'Procédure judiciaire engagée';
  step.status = StepStatus.IN_PROGRESS;
  step.metadata = {
    type: 'CONTENTIOUS',
    startDate: new Date(),
    recommendation: dossier.recommendation
  };

  await this.stepsService.createStepFromEntity(dossier.id, step);
}

private async createAbandonmentStep(dossier: Dossier): Promise<void> {
  const step = new Step();
  step.dossier = dossier;
  step.type = StepType.CLOSURE;
  step.title = 'Dossier abandonné';
  step.description = 'Abandon par le client';
  step.status = StepStatus.COMPLETED;
  step.completedDate = new Date();
  step.metadata = {
    type: 'ABANDONMENT',
    decisionDate: new Date(),
    recommendation: dossier.recommendation
  };

  await this.stepsService.createStepFromEntity(dossier.id, step);
}

/**
 * ⚖️ Enregistrer un jugement
 */
async registerJudgment(
  id: number,
  decision: string,
  isSatisfied: boolean,
  user: User
): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // ✅ Vérifier qu'on est bien en contentieux
  if (dossier.status !== DossierStatus.LITIGATION) {
    throw new BadRequestException(
      `Impossible d'enregistrer un jugement : le dossier est en statut ${dossier.status}, attendu LITIGATION`
    );
  }

  // Enregistrer le jugement
  dossier.final_decision = decision;
  dossier.status = DossierStatus.JUDGMENT;
  dossier.current_decision_type = 'FIRST_INSTANCE';

  // Déterminer les possibilités de recours
  if (!isSatisfied) {
    dossier.appeal_possibility = true;
    // Délai d'appel : 1 mois
    const appealDeadline = new Date();
    appealDeadline.setMonth(appealDeadline.getMonth() + 1);
    dossier.appeal_deadline = appealDeadline;
  } else {
    dossier.appeal_possibility = false;
    dossier.appeal_deadline = null;
  }

  const savedDossier = await this.dossierRepository.save(dossier);
  await this.createJudgmentStep(savedDossier, decision, isSatisfied);

  return this.mapToResponseDto(savedDossier);
}
/**
 * 📝 Interjeter appel
  * À appeler depuis JUDGMENT (après jugement défavorable)
 */
async fileAppeal(id: number, user: User): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // ✅ Vérifier les conditions pour faire appel
  if (!dossier.appeal_possibility) {
    throw new BadRequestException(
      'L\'appel n\'est pas possible : délai expiré ou jugement favorable'
    );
  }

  if (dossier.status !== DossierStatus.JUDGMENT) {
    throw new BadRequestException(
      `L'appel ne peut être interjeté qu'après un jugement. Statut actuel : ${dossier.status}`
    );
  }

  // Vérifier le délai d'appel
  if (dossier.appeal_deadline && new Date() > dossier.appeal_deadline) {
    throw new BadRequestException(
      `Le délai d'appel est expiré (délai: ${dossier.appeal_deadline})`
    );
  }

  // Passer en phase d'appel
  dossier.status = DossierStatus.APPEAL;
  dossier.appeal_filed = true;
  dossier.appeal_possibility = false; // Une fois l'appel fait, plus de possibilité

  const savedDossier = await this.dossierRepository.save(dossier);
  await this.createAppealStep(savedDossier);

  return this.mapToResponseDto(savedDossier);
}

/**
 * ⚖️ Enregistrer un arrêt d'appel
 * À appeler depuis APPEAL
 */
async registerAppealDecision(
  id: number,
  decision: string,
  isSatisfied: boolean,
  user: User
): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // ✅ Vérifier qu'on est bien en appel
  if (dossier.status !== DossierStatus.APPEAL) {
    throw new BadRequestException(
      `Impossible d'enregistrer un arrêt d'appel : le dossier est en statut ${dossier.status}, attendu APPEAL`
    );
  }

  // Enregistrer l'arrêt d'appel
  dossier.final_decision = decision;
  dossier.status = DossierStatus.JUDGMENT; // Retour en JUDGMENT avec la décision d'appel
  dossier.current_decision_type = 'APPEAL';

  // Déterminer les possibilités de cassation
  if (!isSatisfied) {
    dossier.cassation_possibility = true;
    dossier.appeal_possibility = true; 
    // Délai de cassation : 2 mois
    const cassationDeadline = new Date();
    cassationDeadline.setMonth(cassationDeadline.getMonth() + 2);
    dossier.cassation_deadline = cassationDeadline;
  } else {
    // Si satisfait de l'arrêt d'appel, on peut passer à l'exécution
    dossier.cassation_possibility = false;
    dossier.cassation_deadline = null;
  }

  const savedDossier = await this.dossierRepository.save(dossier);
  await this.createAppealDecisionStep(savedDossier, decision, isSatisfied);

  return plainToInstance(DossierResponseDto,savedDossier);
}


/**
 * ⚖️ Enregistrer un arrêt de cassation
 * À appeler depuis CASSATION
 */
async registerCassationDecision(
  id: number,
  decision: 'rejette' | 'casse',
  withRemand: boolean = false,
  user: User
): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  if (dossier.status !== DossierStatus.CASSATION) {
    throw new BadRequestException(
      `Impossible d'enregistrer un arrêt de cassation : le dossier est en statut ${dossier.status}, attendu CASSATION`
    );
  }

  if (decision === 'rejette') {
    dossier.status = DossierStatus.EXECUTION;
    dossier.cassation_filed = true;
  } else if (decision === 'casse') {
    if (withRemand) {
      // ✅ Cassation avec renvoi → nouvelle phase contentieuse
      dossier.status = DossierStatus.LITIGATION;
      dossier.current_decision_type = null;
      dossier.final_decision = null;
      // ✅ Créer une nouvelle étape contentieuse pour le renvoi
      await this.createContentiousStep(dossier);
    } else {
      dossier.status = DossierStatus.CLOSED;
      dossier.closing_date = new Date();
    }
  }

  const savedDossier = await this.dossierRepository.save(dossier);
  await this.createCassationDecisionStep(savedDossier, decision, withRemand);

  return this.mapToResponseDto(savedDossier);
}


/**
 * 🏛️ Former pourvoi en cassation
 * À appeler depuis JUDGMENT (après arrêt d'appel défavorable)
 */
async fileCassation(id: number, user: User): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // ✅ Vérifier les conditions pour faire cassation
  if (!dossier.cassation_possibility) {
    throw new BadRequestException(
      'La cassation n\'est pas possible : délai expiré ou décision favorable'
    );
  }

  if (dossier.status !== DossierStatus.JUDGMENT) {
    throw new BadRequestException(
      `La cassation ne peut être formée qu'après un arrêt d'appel. Statut actuel : ${dossier.status}`
    );
  }

  if (dossier.current_decision_type !== 'APPEAL') {
    throw new BadRequestException(
      'La cassation ne peut être formée que sur un arrêt de cour d\'appel'
    );
  }

  // Vérifier le délai de cassation
  if (dossier.cassation_deadline && new Date() > dossier.cassation_deadline) {
    throw new BadRequestException(
      `Le délai de cassation est expiré (délai: ${dossier.cassation_deadline})`
    );
  }

  // Passer en phase de cassation
  dossier.status = DossierStatus.CASSATION;
  dossier.cassation_filed = true;
  dossier.cassation_possibility = false; // Une fois la cassation faite, plus de possibilité

  const savedDossier = await this.dossierRepository.save(dossier);
  await this.createCassationStep(savedDossier);

  return this.mapToResponseDto(savedDossier);
}


/**
 * Créer l'étape pour l'arrêt de cassation
 */
private async createCassationDecisionStep(
  dossier: Dossier, 
  decision: 'rejette' | 'casse', 
  withRemand: boolean
): Promise<void> {
  try {
    // Récupérer l'étape de cassation en cours
    const currentStep = await this.stepsService.getCurrentStep(dossier.id);
    
    // Créer l'étape pour l'arrêt de cassation
    const step = new Step();
    step.dossier_id = dossier.id;
    step.dossier = dossier;
    step.type = StepType.DECISION;
    step.title = decision === 'rejette' ? 'Arrêt de rejet' : 'Arrêt de cassation';
    step.description = decision === 'rejette' 
      ? 'Pourvoi en cassation rejeté' 
      : `Pourvoi en cassation accepté${withRemand ? ' avec renvoi' : ' sans renvoi'}`;
    step.status = StepStatus.COMPLETED;
    step.completedDate = new Date();
    step.metadata = {
      decisionType: 'CASSATION',
      decision: decision,
      withRemand: withRemand,
      cassationDate: new Date(),
      courtLevel: 'Cour de cassation',
      appealDecision: dossier.appeal_decision || dossier.final_decision,
      ...(withRemand && { remandJurisdiction: dossier.remand_jurisdiction })
    };
    
    await this.stepsService.createStepFromEntity(dossier.id, step);

    // Gérer les cas spécifiques
    if (decision === 'rejette') {
      // Rejet du pourvoi - créer une étape d'exécution
      const executionStep = new Step();
      executionStep.dossier_id = dossier.id;
      executionStep.dossier = dossier;
      executionStep.type = StepType.CLOSURE;
      executionStep.title = 'Exécution de la décision';
      executionStep.description = 'Exécution de l\'arrêt d\'appel définitif';
      executionStep.status = StepStatus.PENDING;
      executionStep.metadata = {
        type: 'EXECUTION_PENDING',
        finalDecision: dossier.appeal_decision || dossier.final_decision,
        cassationOutcome: 'rejected'
      };
      
      await this.stepsService.createStepFromEntity(dossier.id, executionStep);

    } else if (decision === 'casse') {
      if (withRemand) {
        // Cassation avec renvoi - créer une nouvelle étape contentieuse
        const remandStep = new Step();
        remandStep.dossier_id = dossier.id;
        remandStep.dossier = dossier;
        remandStep.type = StepType.CONTENTIOUS;
        remandStep.title = 'Renvoi devant une nouvelle juridiction';
        remandStep.description = `Cassation avec renvoi devant ${dossier.remand_jurisdiction || 'une nouvelle juridiction'}`;
        remandStep.status = StepStatus.IN_PROGRESS;
        remandStep.metadata = {
          type: 'REMAND',
          jurisdiction: dossier.remand_jurisdiction,
          isNewTrial: true,
          originalCassation: decision,
          remandDate: new Date()
        };
        
        await this.stepsService.createStepFromEntity(dossier.id, remandStep);
      } else {
        // Cassation sans renvoi - créer une étape de clôture
        const closureStep = new Step();
        closureStep.dossier_id = dossier.id;
        closureStep.dossier = dossier;
        closureStep.type = StepType.CLOSURE;
        closureStep.title = 'Fin de la procédure';
        closureStep.description = 'Cassation sans renvoi - procédure terminée';
        closureStep.status = StepStatus.COMPLETED;
        closureStep.completedDate = new Date();
        closureStep.metadata = {
          type: 'CASSATION_WITHOUT_REMAND',
          finalStatus: 'CLOSED',
          cassationOutcome: 'accepted_without_remand'
        };
        
        await this.stepsService.createStepFromEntity(dossier.id, closureStep);
      }
    }

    // Marquer l'étape de cassation en cours comme terminée
    if (currentStep && currentStep.type === StepType.APPEAL && 
        currentStep.status === StepStatus.IN_PROGRESS &&
        currentStep.metadata?.type === 'CASSATION') {
      await this.stepsService.updateStep(currentStep.id, {status : StepStatus.COMPLETED});
    }

  } catch (error) {
    console.error('Erreur lors de la création de l\'étape arrêt de cassation:', error);
  }
}



/**
 * Créer l'étape pour l'arrêt d'appel
 */
private async createAppealDecisionStep(
  dossier: Dossier, 
  decision: string, 
  isSatisfied: boolean
): Promise<void> {
  try {
    // Récupérer l'étape d'appel en cours
    const currentStep = await this.stepsService.getCurrentStep(dossier.id);
    
    // Créer l'étape pour l'arrêt d'appel
    const step = new Step();
    step.dossier_id = dossier.id;
    step.dossier = dossier;
    step.type = StepType.DECISION;
    step.title = 'Arrêt de la Cour d\'appel';
    step.description = `Décision: ${decision}`;
    step.status = StepStatus.COMPLETED;
    step.completedDate = new Date();
    step.metadata = {
      decisionType: 'APPEAL',
      decision: decision,
      isSatisfied: isSatisfied,
      appealDate: new Date(),
      courtLevel: 'Cour d\'appel',
      originalJudgment: dossier.first_instance_decision || dossier.final_decision,
      hearingDate: new Date()
    };
    
    await this.stepsService.createStepFromEntity(dossier.id, step);

    // Si le client est insatisfait, créer une étape de cassation potentielle
    if (!isSatisfied && dossier.cassation_possibility) {
      const cassationStep = new Step();
      cassationStep.dossier_id = dossier.id;
      cassationStep.dossier = dossier;
      cassationStep.type = StepType.APPEAL;
      cassationStep.title = 'Possibilité de pourvoi en cassation';
      cassationStep.description = `Délai pour former pourvoi en cassation: ${dossier.cassation_deadline?.toLocaleDateString()}`;
      cassationStep.status = StepStatus.PENDING;
      cassationStep.scheduledDate = dossier.cassation_deadline;
      cassationStep.metadata = {
        type: 'CASSATION_POSSIBILITY',
        deadline: dossier.cassation_deadline,
        appealDecision: decision,
        appealCourt: 'Cour d\'appel',
        isSatisfied: false
      };
      
      await this.stepsService.createStepFromEntity(dossier.id, cassationStep);
    }

    // Marquer l'étape d'appel en cours comme terminée
    if (currentStep && currentStep.type === StepType.APPEAL && 
        currentStep.status === StepStatus.IN_PROGRESS &&
        currentStep.metadata?.type !== 'CASSATION_POSSIBILITY') {
      await this.stepsService.updateStep(currentStep.id, {status : StepStatus.COMPLETED});
    }

  } catch (error) {
    console.error('Erreur lors de la création de l\'étape arrêt d\'appel:', error);
  }
}

/**
 * ✅ Exécuter la décision
 */
/**
 * ✅ Exécuter la décision
 */
async executeDecision(id: number, user: User): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  if (dossier.status !== DossierStatus.JUDGMENT && 
      dossier.status !== DossierStatus.APPEAL && 
      dossier.status !== DossierStatus.CASSATION) {
    throw new BadRequestException('Aucune décision à exécuter');
  }

  dossier.status = DossierStatus.EXECUTION;
  dossier.execution_date = new Date();

  const savedDossier = await this.dossierRepository.save(dossier);
  
  // ✅ Optionnel: créer une étape d'exécution
  await this.createExecutionStep(savedDossier);
  
  return this.mapToResponseDto(savedDossier);
}

/**
 * 🔒 Clôturer le dossier
 */
// Dans dossiers.service.ts
async closeDossier(
  id: number, 
  user: User, 
  closeDto: CloseDossierDto
): Promise<DossierResponseDto> {
  const dossier = await this.findOneV1(id);

  if (!dossier) {
    throw new NotFoundException(`Dossier ${id} non trouvé`);
  }

  this.checkDossierAccess(dossier, user);

  // Vérifier si le dossier peut être clôturé
  const closableStatuses = [
    DossierStatus.OPEN,
    DossierStatus.AMICABLE,
    DossierStatus.ABANDONED,
    DossierStatus.JUDGMENT,
    DossierStatus.CLOSED // Permettre la reclôture avec mise à jour
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
    dossier.appeal_possibility = false;
    dossier.appeal_deadline = null;
    dossier.settlement_amount = null;
    dossier.settlement_terms = null;
    
  } else if (closeDto.outcome === DossierOutcome.LOST) {
    // Dossier perdu
    if (closeDto.appeal_possibility !== undefined) {
      dossier.appeal_possibility = closeDto.appeal_possibility;
    }
    
    if (closeDto.appeal_deadline) {
      dossier.appeal_deadline = new Date(closeDto.appeal_deadline);
    }
    
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
    dossier.appeal_possibility = false;
    dossier.appeal_deadline = null;
    
  } else if (closeDto.outcome === DossierOutcome.ABANDONED) {
    // Dossier abandonné
    // Réinitialiser tous les champs de résultat
    dossier.damages_awarded = 0;
    dossier.costs_awarded = 0;
    dossier.appeal_possibility = false;
    dossier.appeal_deadline = null;
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

  const savedDossier = await this.dossierRepository.save(dossier);
  
  // Déclencher des événements
  // await this.eventEmitter.emit('dossier.closed', { 
  //   dossier: savedDossier, 
  //   user,
  //   wasAlreadyClosed 
  // });
  
  return this.mapToResponseDto(savedDossier);
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

// ========== MÉTHODES PRIVÉES DE CRÉATION D'ÉTAPES ==========

/**
 * Créer l'étape d'analyse préliminaire
 */
private async createAnalysisStep(dossier: Dossier): Promise<void> {
  const step = new Step();
  step.dossier = dossier;
  step.type = StepType.OPENING;
  step.title = 'Analyse préliminaire';
  step.description = dossier.analysis_notes || 'Analyse effectuée';
  step.status = StepStatus.COMPLETED;
  step.completedDate = new Date();
  step.metadata = {
    successProbability: dossier.success_probability,
    dangerLevel: dossier.danger_level,
    recommendation: dossier.recommendation
  };

  await this.stepsService.createStepFromEntity(dossier.id, step);
}



/**
 * Créer l'étape d'exécution
 */
private async createExecutionStep(dossier: Dossier): Promise<void> {
  try {
    const step = new Step();
    step.dossier_id = dossier.id;
    step.dossier = dossier;
    step.type = StepType.CLOSURE;
    step.title = 'Exécution de la décision';
    step.description = `Exécution de la décision ${dossier.final_decision || 'finale'}`;
    step.status = StepStatus.IN_PROGRESS;
    step.metadata = {
      type: 'EXECUTION',
      executionDate: dossier.execution_date || new Date(),
      finalDecision: dossier.final_decision,
      decisionType: dossier.current_decision_type
    };
    
    await this.stepsService.createStepFromEntity(dossier.id, step);
    
  } catch (error) {
    console.error('Erreur lors de la création de l\'étape exécution:', error);
  }
}


/**
 * Créer l'étape selon la décision du client
 */
// private async createDecisionStep(dossier: Dossier, decision: string): Promise<void> {
//   let stepData: Partial<Step> | undefined;

//   switch (decision) {
//     case 'transaction':
//       stepData = {
//         type: StepType.AMIABLE,
//         title: 'Phase transactionnelle',
//         description: 'Négociation avec la partie adverse',
//         status: StepStatus.IN_PROGRESS
//       };
//       break;
//     case 'contentieux':
//       stepData = {
//         type: StepType.CONTENTIOUS,
//         title: 'Phase contentieuse',
//         description: 'Procédure judiciaire engagée',
//         status: StepStatus.IN_PROGRESS
//       };
//       break;
//     case 'abandon':
//       stepData = {
//         type: StepType.CLOSURE,
//         title: 'Dossier abandonné',
//         description: 'Abandon par le client',
//         status: StepStatus.COMPLETED,
//         completedDate: new Date()
//       };
//       break;
//     default:
//       // Si la décision n'est pas reconnue, ne rien faire
//       return;
//   }

//   await this.stepsService.createStepFromEntity(dossier.id, stepData);
// }

/**
 * Créer l'étape pour le jugement de première instance
 */
private async createJudgmentStep(
  dossier: Dossier, 
  decision: string, 
  isSatisfied: boolean
): Promise<void> {
  try {
    // Récupérer l'étape contentieuse en cours
    const currentStep = await this.stepsService.getCurrentStep(dossier.id);
    
    const step = new Step();
    step.dossier_id = dossier.id;
    step.dossier = dossier;
    step.type = StepType.DECISION;
    step.title = 'Jugement du Tribunal';
    step.description = `Décision: ${decision}`;
    step.status = StepStatus.COMPLETED;
    step.completedDate = new Date();
    step.metadata = {
      decisionType: 'FIRST_INSTANCE',
      decision: decision,
      isSatisfied: isSatisfied,
      judgmentDate: new Date(),
      courtLevel: 'Tribunal',
      ...(dossier.success_probability && { successProbability: dossier.success_probability }),
      ...(dossier.danger_level && { dangerLevel: dossier.danger_level }),
      ...(dossier.recommendation && { recommendation: dossier.recommendation })
    };

    await this.stepsService.createStepFromEntity(dossier.id, step);

    // Si le client est insatisfait, créer une étape d'appel potentiel
    if (!isSatisfied && dossier.appeal_possibility) {
      const appealStep = new Step();
      appealStep.dossier_id = dossier.id;
      appealStep.dossier = dossier;
      appealStep.type = StepType.APPEAL;
      appealStep.title = 'Possibilité d\'appel';
      appealStep.description = `Délai pour interjeter appel: ${dossier.appeal_deadline?.toLocaleDateString()}`;
      appealStep.status = StepStatus.PENDING;
      appealStep.scheduledDate = dossier.appeal_deadline;
      appealStep.metadata = {
        type: 'APPEAL_POSSIBILITY',
        deadline: dossier.appeal_deadline,
        judgmentDecision: decision,
        originalJudgment: decision,
        isSatisfied: false
      };
      
      await this.stepsService.createStepFromEntity(dossier.id, appealStep);
    }

    // Marquer l'étape contentieuse en cours comme terminée
    if (currentStep && currentStep.type === StepType.CONTENTIOUS && currentStep.status === StepStatus.IN_PROGRESS) {
      await this.stepsService.updateStep(currentStep.id, {status : StepStatus.COMPLETED});
    }

  } catch (error) {
    console.error('Erreur lors de la création de l\'étape jugement:', error);
    // Ne pas bloquer le processus principal
  }
}

/**
 * Créer l'étape pour l'appel
 */
private async createAppealStep(dossier: Dossier): Promise<void> {
  try {
    // Récupérer l'étape de jugement complétée
    const currentStep = await this.stepsService.getCurrentStep(dossier.id);
    
    const step = new Step();
    step.dossier_id = dossier.id;
    step.dossier = dossier;
    step.type = StepType.APPEAL;
    step.title = 'Procédure d\'appel';
    step.description = 'Appel interjeté - Procédure devant la Cour d\'appel';
    step.status = StepStatus.IN_PROGRESS;
    step.metadata = {
      type: 'APPEAL',
      appealDate: new Date(),
      courtLevel: 'Cour d\'appel',
      originalDecision: dossier.final_decision,
      appealDeadline: dossier.appeal_deadline
    };
    
    await this.stepsService.createStepFromEntity(dossier.id, step);
    
    // Marquer l'étape de possibilité d'appel comme annulée ou complétée
    if (currentStep && currentStep.type === StepType.APPEAL && 
        currentStep.metadata?.type === 'APPEAL_POSSIBILITY') {
      await this.stepsService.updateStep(currentStep.id, {status : StepStatus.COMPLETED});
    }

  } catch (error) {
    console.error('Erreur lors de la création de l\'étape appel:', error);
  }
}

/**
 * Créer l'étape pour la cassation
 */
private async createCassationStep(dossier: Dossier): Promise<void> {
  try {
    // Récupérer l'étape de possibilité de cassation
    const currentStep = await this.stepsService.getCurrentStep(dossier.id);
    
    const step = new Step();
    step.dossier_id = dossier.id;
    step.dossier = dossier;
    step.type = StepType.APPEAL;
    step.title = 'Pourvoi en cassation';
    step.description = 'Pourvoi en cassation formé - Procédure devant la Cour de cassation';
    step.status = StepStatus.IN_PROGRESS;
    step.metadata = {
      type: 'CASSATION',
      cassationDate: new Date(),
      courtLevel: 'Cour de cassation',
      appealDecision: dossier.appeal_decision || dossier.final_decision,
      cassationDeadline: dossier.cassation_deadline
    };
    
    await this.stepsService.createStepFromEntity(dossier.id, step);
    
    // Marquer l'étape de possibilité de cassation comme complétée
    if (currentStep && currentStep.type === StepType.APPEAL && 
        currentStep.metadata?.type === 'CASSATION_POSSIBILITY') {
      await this.stepsService.updateStep(currentStep.id, {status : StepStatus.COMPLETED});
    }

  } catch (error) {
    console.error('Erreur lors de la création de l\'étape cassation:', error);
  }
}

async getCurrentStep(dossier: any): Promise<Step> {

  return await this.stepsService.getCurrentStep(dossier.id);
}


async getDossierWorkflow(dossierId: number) {
  return this.stepsService.getDossierWorkflow(dossierId);
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


}