// src/modules/dossiers/dossiers.service.ts
import { plainToInstance } from 'class-transformer';
import { DossierStatus, RecommendationType } from 'src/core/enums/dossier-status.enum';
import { UserRole } from 'src/core/enums/user-role.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { MailService } from 'src/core/shared/emails/emails.service';
import { PaginatedResult, PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { SearchFilter, SearchUtils } from 'src/core/shared/utils/search.utils';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';


import { Repository, In, FindOptionsWhere } from 'typeorm';
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
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { TypeFacture, StatutFacture } from '../facture/dto/create-facture.dto';
import { FactureService } from '../facture/facture.service';
import { User } from '../iam/user/entities/user.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { ApplyTransitionDto } from '../procedure/dto/create-procedure-instance.dto copy';
import { ProcedureInstance } from '../procedure/entities/procedure-instance.entity';
import { StageVisit } from '../procedure/entities/stage-visit.entity';
import { ProcedureInstanceService } from '../procedure/services/procedure-instance.service';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CloseDossierDto } from './dto/close-dossier.dto';
import { CreateDossierDto, UploadDocumentToSubStageDto } from './dto/create-dossier.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { DangerLevel, Dossier, DossierOutcome } from './entities/dossier.entity';
import { Step, StepStatus, StepType } from './entities/step.entity';

















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
    protected readonly documentCustomerService: DocumentCustomerService,
    protected readonly chatService: ChatService,
    // protected readonly stepsService: StepsService,
    private procedureInstanceService: ProcedureInstanceService,
    private readonly planQuotaService: PlanQuotaService,
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
    @Inject(forwardRef(() => FactureService))
    private readonly factureService: FactureService,
    protected readonly emailsService?: MailService, // Optionnel

  ) {
    super(dossierRepository, paginationService, emailsService);
    console.log('DossiersService initialized ',  forwardRef);
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

    // let procedureInstanceDTO = new CreateProcedureInstanceDto();
    // procedureInstanceDTO.templateId = procedureSubtype.procedure_template?.id || procedureType.procedure_template?.id;
    // procedureInstanceDTO.title = createDossierDto.dossier_number;

    // const procedureInstance = await this.procedureInstanceService.create(procedureInstanceDTO, createdBy.id.toString())

    const dossier = this.dossierRepository.create({
      ...createDossierDto,
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
      status: DossierStatus.OPEN,
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

    // ── Facture de frais d'ouverture de dossier ───────────────────────────────
    try {
      const cabinet = await this.cabinetRepository.findOne({ where: {} });
      console.log('Cabinet info for dossier opening fee:', cabinet);
      if (cabinet?.dossier_opening_fee_enabled && Number(cabinet.dossier_opening_fee) > 0) {
        const montantHT  = Number(cabinet.dossier_opening_fee);
        const tauxTVA    = Number(cabinet.dossier_opening_fee_tva ?? 0);
        const montantTVA = Math.round(montantHT * tauxTVA) / 100;
        const montantTTC = montantHT + montantTVA;
        const label      = cabinet.dossier_opening_fee_label?.trim() || "Frais d'ouverture de dossier";
        const today      = new Date();
        const echeance   = new Date(today);
        echeance.setDate(echeance.getDate() + 30);

        await this.factureService.createFacture({
          dossierId:   savedDossier.id,
          clientId:    client.id,
          type:        TypeFacture.FRAIS_PROCEDURE,
          statut:      StatutFacture.ENVOYEE,
          montantHT,
          tauxTVA,
          montantTVA,
          montantTTC,
          dateFacture:  today,
          dateEcheance: echeance,
          description:  label,
          notify_client: false,
        } as any);
      }
    } catch (err) {
      // On ne fait pas échouer la création du dossier si la facture échoue
      console.error('⚠️ Erreur création facture ouverture dossier :', err?.message);
    }

    // this.procedureInstanceService.update(procedureInstance.id , {data:{id: savedDossier.id}})
    let mailDto = new CreateMailDto() 
    const dossierR = await this.mapToResponseDto(savedDossier);
    mailDto.templateName = "entities/dossier/dossier-created-creator"
    mailDto.context = dossierR
    mailDto.to = users.map(u => u.email)
    mailDto.subject = "Creation d'un nouveau dossier"
    // this.sendMail(mailDto)
    return dossierR
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
  console.log(id);
  
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
    if (updateDossierDto.notify_client !== undefined) {
      (dossier as any).notify_client = !!updateDossierDto.notify_client;
    }
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
    const settings = await this.cabinetRepository.findOne({ where: {} });
    const prefix   = (settings?.dossier_prefix ?? 'DOS-').toString();
    const padding  = 4;
    const template = (settings?.dossier_number_format ?? '{PREFIX}{YYYY}-{NNNN}').toString();

    const now  = new Date();
    const YYYY = now.getFullYear().toString();
    const MM   = (now.getMonth() + 1).toString().padStart(2, '0');

    // Partie fixe avant le compteur (jeton {NNNN})
    const searchPrefix = template
      .replace('{PREFIX}', prefix)
      .replace('{YYYY}',   YYYY)
      .replace('{MM}',     MM)
      .replace('{NNNN}',   '');

    const last = await this.dossierRepository
      .createQueryBuilder('d')
      .where('d.dossier_number LIKE :pfx', { pfx: `${searchPrefix}%` })
      .orderBy('d.dossier_number', 'DESC')
      .getOne();

    let nextSeq = 1;
    if (last?.dossier_number) {
      const tail  = last.dossier_number.slice(searchPrefix.length);
      const match = tail.match(/^(\d+)/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }

    const buildNumber = (seq: number) =>
      template
        .replace('{PREFIX}', prefix)
        .replace('{YYYY}',   YYYY)
        .replace('{MM}',     MM)
        .replace('{NNNN}',   seq.toString().padStart(padding, '0'));

    let dossierNumber = buildNumber(nextSeq);

    // Filet anti-collision
    let safety = 0;
    while (safety++ < 100) {
      const existing = await this.dossierRepository.findOne({
        where: { dossier_number: dossierNumber },
      });
      if (!existing) break;
      nextSeq++;
      dossierNumber = buildNumber(nextSeq);
    }

    return dossierNumber;
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

    // Avocat / autres rôles internes : doit être l'avocat référent ou collaborateur
    const isOwner = dossier.lawyer?.id === authUser.id;
    const isCollaborator = dossier.collaborators?.some(c => c.id === authUser.id) ?? false;

    if (!isOwner && !isCollaborator) {
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

  if (dossier.is_closed || dossier.is_archived) {
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
  const saved = await this.dossierRepository.save(dossier);

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

  if (dossier.is_closed || dossier.is_archived) {
    throw new BadRequestException(
      "Impossible de retirer un collaborateur d'un dossier clôturé ou archivé",
    );
  }

  dossier.collaborators = (dossier.collaborators || []).filter((c) => c.id !== empId);
  const saved = await this.dossierRepository.save(dossier);

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

  if (dossier.is_closed || dossier.is_archived) {
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

  dossier.collaborators = employees;
  const saved = await this.dossierRepository.save(dossier);

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
    const customerId: number = (dossier as any).client?.id ?? (dossier as any).client_id;
    if (!customerId) {
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
    const created = await this.documentCustomerService.create(
      {
        document_type_id: dto.document_type_id,
        category_id:      dto.category_id,
        dossier_id:       dossierId,
        customer_id:      customerId,
        name:             dto.name,
        description:      dto.description,
        is_confidential:  dto.is_confidential,
        strict:           true,
        file,
      },
      user?.id,
    );

    // 4. Lier le document à la visite de sous-étape (table sub_stage_visit_documents)
    if (subStageVisitId && created?.id) {
      await this.documentCustomerService.linkDocumentsToSubStage([created.id], subStageVisitId);
    }

    return created;
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
    // const currentStep = await this.stepsService.getCurrentStep(dossier.id);
    
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
    
    // await this.stepsService.createStepFromEntity(dossier.id, step);

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
      
      // await this.stepsService.createStepFromEntity(dossier.id, executionStep);

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
        
        // await this.stepsService.createStepFromEntity(dossier.id, remandStep);
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
        
        // await this.stepsService.createStepFromEntity(dossier.id, closureStep);
      }
    }

    // Marquer l'étape de cassation en cours comme terminée
    // if (currentStep && currentStep.type === StepType.APPEAL && 
    //     currentStep.status === StepStatus.IN_PROGRESS &&
    //     currentStep.metadata?.type === 'CASSATION') {
    //   await this.stepsService.updateStep(currentStep.id, {status : StepStatus.COMPLETED});
    // }

  } catch (error) {
    console.error('Erreur lors de la création de l\'étape arrêt de cassation:', error);
  }
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


async applyTransition(
    instanceId: string,
    transitionId: string,
    userId: string,
    dto: ApplyTransitionDto,
    comment?: string,
  ): Promise<ProcedureInstance> {
      return this.procedureInstanceService.applyTransition(
        instanceId,
        transitionId,
        userId,
        dto.userInputs,
        // fileIds,
        comment,
      );
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

  // await this.stepsService.createStepFromEntity(dossier.id, step);
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
    
    // await this.stepsService.createStepFromEntity(dossier.id, step);
    
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

  // await this.stepsService.createStepFromEntity(dossier.id, stepData);
// }


/**
 * Créer l'étape pour l'appel
 */
private async createAppealStep(dossier: Dossier): Promise<void> {

}

/**
 * Créer l'étape pour la cassation
 */
private async createCassationStep(dossier: Dossier): Promise<void> {

}

// u

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
  console.log('Stage visits for dossier', dossierId, visits);

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
  console.log('Sub Stage visit for dossier', dossierId, stageVisit);

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
