// src/modules/dossiers/dossiers.service.ts
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { UserRole } from 'src/core/enums/user-role.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { PaginatedResult, PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { SearchFilter, SearchUtils } from 'src/core/shared/utils/search.utils';
import { Repository, In, Between, FindOptionsWhere } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { subMonths } from 'date-fns';


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
import { DangerLevel, Dossier } from './entities/dossier.entity';
import { ChatService } from '../chat/services/chat/chat.service';
import { CreateConversationDto } from '../chat/dto/create-conversation.dto';
import { MailService } from 'src/core/shared/emails/emails.service';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { DistributionItem, EvolutionData } from 'src/core/types/base-stats.dto';
import { DossierStatsDto, FinancialStatsDto, RecentDossierDto, TimelineStatsDto, UrgentDossierDto } from './dto/dossier-stats.dto';
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
    protected readonly chatService: ChatService,
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
      relationFields: ['client', 'lawyer', 'diligences','lawyer.user', 'jurisdiction', 'procedure_type', 'procedure_subtype', 'documents', 'audiences', 'factures', 'collaborators', 'collaborators.user']
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
      this.procedureTypeRepository.findOne({ where: { id: createDossierDto.procedure_subtype_id } }),
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
    const dossier = this.dossierRepository.create({
      ...createDossierDto,
      dossier_number: dossierNumber,
      client,
      lawyer,
      jurisdiction_id : createDossierDto.jurisdiction ?? 1,
      jurisdiction: {id : createDossierDto.jurisdiction ?? 1} as Jurisdiction,
      procedure_type: procedureType,
      procedure_subtype: procedureSubtype,
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

  async findOne(id: number, user?: User): Promise<DossierResponseDto | any> {
    console.log(id)

    const dossier = await this.dossierRepository.findOne({
      where: { id },
      relations: [
        'client',
        'client.location_city',
        'lawyer',
        'lawyer.user',
        'procedure_type',
        'procedure_subtype',
        'documents',
        'audiences',
        'factures',
        'steps',
        'jurisdiction',
        'collaborators',
        'conversation',
        'collaborators.user',
        'diligences'
        // 'comments',
        // 'comments.user'
      ],
    });
    // console.log(dossier)

    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }

    // Vérification des droits d'accès
    // this.checkDossierAccess(dossier, user);

    // return dossier;
    return plainToInstance(DossierResponseDto,dossier);
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
      // throw new ForbiddenException('Accès non autorisé à ce dossier');
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









  async getStats(filters?: {
    startDate?: Date;
    endDate?: Date;
    lawyerId?: number;
    procedureTypeId?: number;
  }): Promise<DossierStatsDto> {
    const [total, active, closed, archived] = await Promise.all([
      this.getTotalCount(filters),
      this.getActiveCount(filters),
      this.getClosedCount(filters),
      this.getArchivedCount(filters),
    ]);

    const [
      evolution,
      byStatus,
      byDangerLevel,
      byPriority,
      byProcedureType,
      byJurisdiction,
      financialStats,
      timelineStats,
      lawyerStats,
      recentDossiers,
      urgentDossiers
    ] = await Promise.all([
      this.getEvolution(filters),
      this.getDistributionByStatus(filters),
      this.getDistributionByDangerLevel(filters),
      this.getDistributionByPriority(filters),
      this.getDistributionByProcedureType(filters),
      this.getDistributionByJurisdiction(filters),
      this.getFinancialStats(filters),
      this.getTimelineStats(filters),
      this.getLawyerStats(filters),
      this.getRecentDossiers(filters),
      this.getUrgentDossiers(filters),
    ]);

    return {
      total,
      activeDossiers: active,
      closedDossiers: closed,
      archivedDossiers: archived,
      evolution,
      byStatus,
      byDangerLevel,
      byPriority,
      byProcedureType,
      byJurisdiction,
      financialStats,
      timelineStats,
      // lawyerStats,
      recentDossiers,
      urgentDossiers,
    };
  }

  private async getTotalCount(filters?: any): Promise<number> {
    const query = this.dossierRepository.createQueryBuilder('dossier');
    this.applyFilters(query, filters);
    return query.getCount();
  }

  private async getActiveCount(filters?: any): Promise<number> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .where('dossier.status IN (:...statuses)', {
        statuses: [DossierStatus.OPEN, DossierStatus.AMICABLE, DossierStatus.LITIGATION, DossierStatus.DECISION, DossierStatus.APPEAL]
      });
    this.applyFilters(query, filters);
    return query.getCount();
  }

  private async getClosedCount(filters?: any): Promise<number> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .where('dossier.status = :status', { status: DossierStatus.CLOSED });
    this.applyFilters(query, filters);
    return query.getCount();
  }

  private async getArchivedCount(filters?: any): Promise<number> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .where('dossier.status = :status', { status: DossierStatus.ARCHIVED });
    this.applyFilters(query, filters);
    return query.getCount();
  }

  private async getEvolution(filters?: any): Promise<EvolutionData[]> {
    const { startDate = subMonths(new Date(), 6), endDate = new Date() } = filters || {};
    
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .select('DATE(dossier.opening_date)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.opening_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy('DATE(dossier.opening_date)')
      .orderBy('date', 'ASC');

    this.applyFilters(query, filters, 'dossier');

    const results = await query.getRawMany();
    
    let cumulative = 0;
    return results.map(r => {
      cumulative += parseInt(r.count);
      return {
        date: r.date,
        count: parseInt(r.count),
        cumulative,
        period: 'day',
      };
    });
  }

  private async getDistributionByStatus(filters?: any): Promise<DistributionItem[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .select('dossier.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dossier.status');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const statusLabels = {
      [DossierStatus.OPEN]: 'Ouvert',
      [DossierStatus.AMICABLE]: 'Amiable',
      [DossierStatus.LITIGATION]: 'Contentieux',
      [DossierStatus.DECISION]: 'Décision',
      [DossierStatus.APPEAL]: 'Recours',
      [DossierStatus.CLOSED]: 'Clôturé',
      [DossierStatus.ARCHIVED]: 'Archivé',
    };

    const statusColors = {
      [DossierStatus.OPEN]: '#3b82f6', // bleu
      [DossierStatus.AMICABLE]: '#10b981', // vert
      [DossierStatus.LITIGATION]: '#f59e0b', // orange
      [DossierStatus.DECISION]: '#8b5cf6', // violet
      [DossierStatus.APPEAL]: '#ef4444', // rouge
      [DossierStatus.CLOSED]: '#6b7280', // gris
      [DossierStatus.ARCHIVED]: '#9ca3af', // gris clair
    };

    return results.map(r => ({
      name: statusLabels[r.status] || `Status ${r.status}`,
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
      color: statusColors[r.status],
      id: r.status,
      code: DossierStatus[r.status],
    }));
  }

  private async getDistributionByDangerLevel(filters?: any): Promise<DistributionItem[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .select('dossier.danger_level', 'level')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dossier.danger_level');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const levelLabels = {
      [DangerLevel.Faible]: 'Faible',
      [DangerLevel.Normal]: 'Normal',
      [DangerLevel.Eleve]: 'Élevé',
      [DangerLevel.Critique]: 'Critique',
    };

    const levelColors = {
      [DangerLevel.Faible]: '#10b981', // vert
      [DangerLevel.Normal]: '#3b82f6', // bleu
      [DangerLevel.Eleve]: '#f59e0b', // orange
      [DangerLevel.Critique]: '#ef4444', // rouge
    };

    return results.map(r => ({
      name: levelLabels[r.level] || `Niveau ${r.level}`,
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
      color: levelColors[r.level],
      id: r.level,
    }));
  }

  private async getDistributionByPriority(filters?: any): Promise<DistributionItem[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .select('dossier.priority_level', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('dossier.priority_level');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    const priorityLabels = {
      0: 'Basse',
      1: 'Moyenne',
      2: 'Haute',
      3: 'Urgente',
    };

    const priorityColors = {
      0: '#9ca3af', // gris
      1: '#3b82f6', // bleu
      2: '#f59e0b', // orange
      3: '#ef4444', // rouge
    };

    return results.map(r => ({
      name: priorityLabels[r.priority] || `Priorité ${r.priority}`,
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
      color: priorityColors[r.priority],
      id: r.priority,
    }));
  }

  private async getDistributionByProcedureType(filters?: any): Promise<DistributionItem[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.procedure_type', 'procedureType')
      .select('procedureType.id', 'id')
      .addSelect('procedureType.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('procedureType.id IS NOT NULL')
      .groupBy('procedureType.id, procedureType.name');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Non spécifié',
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
      id: r.id,
    }));
  }

  private async getDistributionByJurisdiction(filters?: any): Promise<DistributionItem[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.jurisdiction', 'jurisdiction')
      .select('jurisdiction.id', 'id')
      .addSelect('jurisdiction.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('jurisdiction.id IS NOT NULL')
      .groupBy('jurisdiction.id, jurisdiction.name')
      .orderBy('count', 'DESC')
      .limit(10);

    this.applyFilters(query, filters);

    const results = await query.getRawMany();
    const total = results.reduce((sum, r) => sum + parseInt(r.count), 0);

    return results.map(r => ({
      name: r.name || 'Non spécifié',
      value: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
      id: r.id,
    }));
  }

  private async getFinancialStats(filters?: any): Promise<FinancialStatsDto> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .select('SUM(dossier.budget_estimate)', 'totalBudget')
      .addSelect('SUM(dossier.actual_costs)', 'totalActual')
      .addSelect('AVG(dossier.budget_estimate)', 'avgBudget')
      .addSelect('AVG(dossier.actual_costs)', 'avgActual')
      .where('dossier.budget_estimate IS NOT NULL OR dossier.actual_costs IS NOT NULL');

    this.applyFilters(query, filters);

    const totals = await query.getRawOne();

    // Stats par statut
    const byStatusQuery = this.dossierRepository.createQueryBuilder('dossier')
      .select('dossier.status', 'status')
      .addSelect('SUM(dossier.budget_estimate)', 'budgetEstimate')
      .addSelect('SUM(dossier.actual_costs)', 'actualCosts')
      .where('dossier.budget_estimate IS NOT NULL OR dossier.actual_costs IS NOT NULL')
      .groupBy('dossier.status');

    this.applyFilters(byStatusQuery, filters);

    const byStatus = await byStatusQuery.getRawMany();

    const statusLabels = {
      [DossierStatus.OPEN]: 'Ouvert',
      [DossierStatus.AMICABLE]: 'Amiable',
      [DossierStatus.LITIGATION]: 'Contentieux',
      [DossierStatus.DECISION]: 'Décision',
      [DossierStatus.APPEAL]: 'Recours',
      [DossierStatus.CLOSED]: 'Clôturé',
      [DossierStatus.ARCHIVED]: 'Archivé',
    };

    return {
      totalBudgetEstimate: parseFloat(totals?.totalBudget || 0),
      totalActualCosts: parseFloat(totals?.totalActual || 0),
      averageBudgetPerDossier: parseFloat(totals?.avgBudget || 0),
      averageCostPerDossier: parseFloat(totals?.avgActual || 0),
      budgetVsActual: totals?.totalBudget ? 
        ((parseFloat(totals.totalActual) / parseFloat(totals.totalBudget)) * 100) : 0,
      byStatus: byStatus.map(s => ({
        status: statusLabels[s.status] || `Status ${s.status}`,
        budgetEstimate: parseFloat(s.budgetEstimate || 0),
        actualCosts: parseFloat(s.actualCosts || 0),
        // Correction pour la ligne 302
        difference: parseFloat((s.actualCosts || '0')) - parseFloat((s.budgetEstimate || '0')),        
      })),
    };
  }

  private async getTimelineStats(filters?: any): Promise<TimelineStatsDto> {
    // Dossiers clôturés avec date d'ouverture et de clôture
    const closedQuery = this.dossierRepository.createQueryBuilder('dossier')
      .select('dossier.id')
      .addSelect('dossier.opening_date', 'openingDate')
      .addSelect('dossier.closing_date', 'closingDate')
      // Pour MySQL : DATEDIFF retourne la différence en jours
      .addSelect('DATEDIFF(dossier.closing_date, dossier.opening_date)', 'duration')
      .where('dossier.status = :status', { status: DossierStatus.CLOSED })
      .andWhere('dossier.opening_date IS NOT NULL')
      .andWhere('dossier.closing_date IS NOT NULL');

    this.applyFilters(closedQuery, filters);

    const closedDossiers = await closedQuery.getRawMany();
    
    const durations = closedDossiers.map(d => parseInt(d.duration));
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    // Stats par type de procédure
    const byProcedureQuery = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoin('dossier.procedure_type', 'procedureType')
      .select('procedureType.name', 'procedureType')
      // MySQL: AVG de DATEDIFF
      .addSelect('AVG(DATEDIFF(dossier.closing_date, dossier.opening_date))', 'avgDuration')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.status = :status', { status: DossierStatus.CLOSED })
      .andWhere('dossier.opening_date IS NOT NULL')
      .andWhere('dossier.closing_date IS NOT NULL')
      .andWhere('procedureType.id IS NOT NULL')
      .groupBy('procedureType.name');

    this.applyFilters(byProcedureQuery, filters);

    const byProcedure = await byProcedureQuery.getRawMany();

    // Tendances mensuelles - Version MySQL
    const { startDate = subMonths(new Date(), 12), endDate = new Date() } = filters || {};

    // Pour MySQL: utiliser DATE_FORMAT au lieu de TO_CHAR
    const openingTrendQuery = this.dossierRepository.createQueryBuilder('dossier')
      .select("DATE_FORMAT(dossier.opening_date, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.opening_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy("DATE_FORMAT(dossier.opening_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(openingTrendQuery, filters);

    const openingTrend = await openingTrendQuery.getRawMany();

    const closingTrendQuery = this.dossierRepository.createQueryBuilder('dossier')
      .select("DATE_FORMAT(dossier.closing_date, '%Y-%m')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('dossier.closing_date BETWEEN :start AND :end', { start: startDate, end: endDate })
      .andWhere('dossier.status = :status', { status: DossierStatus.CLOSED })
      .groupBy("DATE_FORMAT(dossier.closing_date, '%Y-%m')")
      .orderBy('month', 'ASC');

    this.applyFilters(closingTrendQuery, filters);

    const closingTrend = await closingTrendQuery.getRawMany();

    return {
      averageDuration: Math.round(avgDuration),
      shortestDuration: durations.length > 0 ? Math.min(...durations) : 0,
      longestDuration: durations.length > 0 ? Math.max(...durations) : 0,
      byProcedureType: byProcedure.map(p => ({
        procedureType: p.procedureType,
        averageDuration: Math.round(parseFloat(p.avgDuration)),
        count: parseInt(p.count),
      })),
      openingTrend: openingTrend.map(o => ({
        month: o.month,
        count: parseInt(o.count),
      })),
      closingTrend: closingTrend.map(c => ({
        month: c.month,
        count: parseInt(c.count),
      })),
    };
  }

  private async getLawyerStats(filters?: any): Promise<any[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoin('dossier.lawyer', 'lawyer')
      .leftJoin('lawyer.user', 'user')
      .select('lawyer.id', 'lawyerId')
      // MySQL: CONCAT au lieu de || 
      .addSelect("CONCAT(user.first_name, ' ', user.last_name)", 'lawyerName')
      .addSelect('COUNT(*)', 'totalDossiers')
      .addSelect('SUM(CASE WHEN dossier.status IN (:...activeStatuses) THEN 1 ELSE 0 END)', 'activeDossiers')
      .addSelect('SUM(CASE WHEN dossier.status = :closedStatus THEN 1 ELSE 0 END)', 'closedDossiers')
      // MySQL: DATEDIFF au lieu de EXTRACT
      .addSelect('AVG(DATEDIFF(dossier.closing_date, dossier.opening_date))', 'avgDuration')
      .setParameters({
        activeStatuses: [DossierStatus.OPEN, DossierStatus.AMICABLE, DossierStatus.LITIGATION, DossierStatus.DECISION, DossierStatus.APPEAL],
        closedStatus: DossierStatus.CLOSED,
      })
      .where('lawyer.id IS NOT NULL')
      .groupBy('lawyer.id, user.first_name, user.last_name');

    this.applyFilters(query, filters);

    const results = await query.getRawMany();

    return results.map(r => ({
      lawyerId: parseInt(r.lawyerId),
      lawyerName: r.lawyerName || 'Avocat',
      totalDossiers: parseInt(r.totalDossiers),
      activeDossiers: parseInt(r.activeDossiers || 0),
      closedDossiers: parseInt(r.closedDossiers || 0),
      averageDuration: Math.round(parseFloat(r.avgDuration || 0)),
      successRate: 75,
    })).sort((a, b) => b.totalDossiers - a.totalDossiers)
      .slice(0, 10);
  }

  private async getRecentDossiers(filters?: any): Promise<RecentDossierDto[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('dossier.lawyer', 'lawyer')
      .leftJoinAndSelect('lawyer.user', 'user')
      .select([
        'dossier.id',
        'dossier.dossier_number',
        'dossier.object',
        'dossier.status',
        'dossier.danger_level',
        'dossier.opening_date',
        'client',
        'lawyer',
        'user'
      ])
      .orderBy('dossier.opening_date', 'DESC')
      .limit(10);

    this.applyFilters(query, filters);

    const results = await query.getMany();

    return results.map(d => ({
      id: d.id,
      dossierNumber: d.dossier_number,
      object: d.object,
      clientName: d.client?.full_name || 'Client inconnu',
      status: d.status,
      dangerLevel: d.danger_level,
      openingDate: d.opening_date,
      lawyerName: d.lawyer?.full_name || 'Avocat inconnu',
    }));
  }

  private async getUrgentDossiers(filters?: any): Promise<UrgentDossierDto[]> {
    const query = this.dossierRepository.createQueryBuilder('dossier')
      .leftJoinAndSelect('dossier.client', 'client')
      .leftJoinAndSelect('dossier.lawyer', 'lawyer')
      .leftJoinAndSelect('lawyer.user', 'user')
      .leftJoinAndSelect('dossier.audiences', 'audience')
      .where('dossier.status IN (:...activeStatuses)', {
        activeStatuses: [DossierStatus.OPEN, DossierStatus.AMICABLE, DossierStatus.LITIGATION]
      })
      .andWhere('(dossier.danger_level IN (:...highLevels) OR dossier.priority_level >= :highPriority)', {
        highLevels: [DangerLevel.Eleve, DangerLevel.Critique],
        highPriority: 2
      })
      .orderBy('dossier.danger_level', 'DESC')
      .addOrderBy('dossier.priority_level', 'DESC')
      .addOrderBy('dossier.opening_date', 'ASC')
      .limit(10);

    this.applyFilters(query, filters);

    const results = await query.getMany();

    return results.map(d => {
      const nextAudience = d.audiences?.find(a => a.is_upcoming);
      
      return {
        id: d.id,
        dossierNumber: d.dossier_number,
        object: d.object,
        clientName: d.client?.full_name || 'Client inconnu',
        dangerLevel: d.danger_level,
        priorityLevel: d.priority_level,
        nextAudience: nextAudience?.full_datetime,
        daysUntilDeadline: nextAudience ? 
          Math.ceil((nextAudience.full_datetime.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 
          undefined,
      };
    });
  }

  private applyFilters(query: any, filters?: any, alias: string = 'dossier'): void {
    if (!filters) return;

    if (filters.startDate) {
      query.andWhere(`${alias}.opening_date >= :startDate`, { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere(`${alias}.opening_date <= :endDate`, { endDate: filters.endDate });
    }

    if (filters.lawyerId) {
      query.andWhere(`${alias}.lawyer_id = :lawyerId`, { lawyerId: filters.lawyerId });
    }

    if (filters.procedureTypeId) {
      query.andWhere(`${alias}.procedure_type_id = :procedureTypeId`, { procedureTypeId: filters.procedureTypeId });
    }

    if (filters.jurisdictionId) {
      query.andWhere(`${alias}.jurisdiction_id = :jurisdictionId`, { jurisdictionId: filters.jurisdictionId });
    }
  }
}