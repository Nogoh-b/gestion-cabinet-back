// src/modules/dossiers/dossiers.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, Between, FindOptionsWhere } from 'typeorm';
import { Dossier } from './entities/dossier.entity';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { plainToInstance } from 'class-transformer';
import { Customer } from '../customer/customer/entities/customer.entity';
import { User } from '../iam/user/entities/user.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { PaginatedResult, PaginationService } from 'src/core/shared/services/pagination/paginations.service';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { UserRole } from 'src/core/enums/user-role.enum';
import { SearchFilter, SearchUtils } from 'src/core/shared/utils/search.utils';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';

@Injectable()
export class DossiersService  extends BaseServiceV1<Dossier>  {
  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    @InjectRepository(Customer)
    private readonly clientRepository: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ProcedureType)
    private readonly procedureTypeRepository: Repository<ProcedureType>,
    protected readonly paginationService: PaginationService,

  ) {
    super(dossierRepository, paginationService);

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
        'court_name',
        'case_number',
        'opposing_party_name',
        'opposing_party_lawyer',
        'opposing_party_contact',
        'client.first_name',
        'client.last_name',
        'procedure_type.name',
        'procedure_subtype.name',
        'client.email'
      ],
      
      // Champs pour recherche exacte
      exactMatchFields: [
        'id',
        'status',
        'confidentiality_level',
        'priority_level',
        'budget_estimate'
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
        'lawyer',
        'procedure_type',
        'procedure_subtype',
      ]
    };
  }

  /**
   * Recherche avancée des clients avec relations
   */
async searhDosiers(
  criteria: any,
  paginationParams?: any,
  relations: string[] = ['client', 'lawyer', 'procedure_type', 'procedure_subtype', 'documents', 'audiences', 'factures', 'collaborators']
) {
  const paginatedResult = await this.searchWithTransformer(
    criteria,
    async (data: Dossier[]) => {
      return plainToInstance(DossierResponseDto, data, {
        excludeExtraneousValues: false,
        enableImplicitConversion: true,
      });
    },
    paginationParams,
    relations
  );

  return paginatedResult;
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
      this.userRepository.findOne({ where: { id: createDossierDto.lawyer_id } }),
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

    const dossier = this.dossierRepository.create({
      ...createDossierDto,
      dossier_number: dossierNumber,
      client,
      lawyer,
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

    const savedDossier = await this.dossierRepository.save(dossier);
    return this.mapToResponseDto(savedDossier);
  }

  async findAll(searchDto: DossierSearchDto, user: User): Promise<{ data: DossierResponseDto[], total: number }> {
    const where: FindOptionsWhere<Dossier> = {};

    // Filtrage par rôle utilisateur
    /*if (user.role === UserRole.AVOCAT) {
      where.lawyer = { id: user.id };
    } else if (user.role === 'client') {
      where.client = { id: user.id }; // Si un client peut accéder à ses dossiers
    }*/

    // Filtres de recherche
    if (searchDto.search) {
      where.object = Like(`%${searchDto.search}%`);
    }

    if (searchDto.status) {
      where.status = searchDto.status;
    }

    if (searchDto.client_id) {
      where.client = { id: Number(searchDto.client_id) };
    }

    if (searchDto.lawyer_id) {
      where.lawyer = { id: Number(searchDto.lawyer_id) };
    }

    if (searchDto.procedure_type_id) {
      where.procedure_type = { id: searchDto.procedure_type_id };
    }

    if (searchDto.procedure_subtype_id) {
      where.procedure_subtype = { id: searchDto.procedure_subtype_id };
    }

    if (searchDto.jurisdiction) {
      where.jurisdiction = Like(`%${searchDto.jurisdiction}%`);
    }

    // Filtre par date
    if (searchDto.date_from || searchDto.date_to) {
      const dateFrom = searchDto.date_from ? new Date(searchDto.date_from) : new Date('2000-01-01');
      const dateTo = searchDto.date_to ? new Date(searchDto.date_to) : new Date();
      where.created_at = Between(dateFrom, dateTo);
    }

    const [dossiers, total] = await this.dossierRepository.findAndCount({
      where,
      relations: [
        'client',
        'lawyer',
        'procedure_type',
        'procedure_subtype',
        'documents',
        'audiences',
        'factures',
        'collaborators'
      ],
      order: { [(searchDto.sort_by || 'created_at') as string]: searchDto.sort_desc ? 'DESC' : 'ASC' },
      // skip: searchDto.offset,
      take: searchDto.limit,
    });

    const responseDtos = dossiers.map(dossier => this.mapToResponseDto(dossier));
    
    return {
      data: responseDtos,
      total
    };
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

  async findOne(id: number, user: User): Promise<DossierResponseDto> {
    const dossier = await this.dossierRepository.findOne({
      where: { id },
      relations: [
        'client',
        'lawyer',
        'procedure_type',
        'procedure_subtype',
        'documents',
        'audiences',
        'factures',
        'collaborators',
        // 'comments',
        // 'comments.user'
      ],
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }

    // Vérification des droits d'accès
    this.checkDossierAccess(dossier, user);

    return this.mapToResponseDto(dossier);
  }

  async update(id: number, updateDossierDto: UpdateDossierDto, user: User): Promise<DossierResponseDto> {
    const dossier = await this.dossierRepository.findOne({
      where: { id },
      relations: ['client', 'lawyer', 'procedure_type', 'procedure_subtype', 'collaborators']
    });

    if (!dossier) {
      throw new NotFoundException(`Dossier ${id} non trouvé`);
    }

    this.checkDossierAccess(dossier, user);

    // Validation si changement de type/sous-type
    if (updateDossierDto.procedure_type_id || updateDossierDto.procedure_subtype_id) {
      const typeId = updateDossierDto.procedure_type_id || dossier.procedure_type.id;
      const subtypeId = updateDossierDto.procedure_subtype_id || dossier.procedure_subtype.id;
      
      const isValid = await this.validateProcedureTypeSubtype(typeId, subtypeId);
      if (!isValid) {
        throw new BadRequestException('Le sous-type ne correspond pas au type de procédure');
      }
    }

    // Mise à jour des relations si nécessaire
    if (updateDossierDto.client_id) {
      const client = await this.clientRepository.findOne({ where: { id: updateDossierDto.client_id } });
      if (!client) throw new NotFoundException('Client non trouvé');
      dossier.client = client;
    }

    if (updateDossierDto.lawyer_id) {
      const lawyer = await this.userRepository.findOne({ where: { id: updateDossierDto.lawyer_id } });
      if (!lawyer) throw new NotFoundException('Avocat non trouvé');
      dossier.lawyer = lawyer;
    }

    if (updateDossierDto.procedure_type_id) {
      const procedureType = await this.procedureTypeRepository.findOne({ 
        where: { id: updateDossierDto.procedure_type_id } 
      });
      if (!procedureType) throw new NotFoundException('Type de procédure non trouvé');
      dossier.procedure_type = procedureType;
    }

    if (updateDossierDto.procedure_subtype_id) {
      const procedureSubtype = await this.procedureTypeRepository.findOne({ 
        where: { id: updateDossierDto.procedure_subtype_id } 
      });
      if (!procedureSubtype) throw new NotFoundException('Sous-type de procédure non trouvé');
      dossier.procedure_subtype = procedureSubtype;
    }

    // Mise à jour des collaborateurs
    if (updateDossierDto.collaborator_ids) {
      const collaborators = await this.userRepository.find({
        where: { id: In(updateDossierDto.collaborator_ids) }
      });
      dossier.collaborators = collaborators;
    }

    // Mise à jour des champs simples
    Object.assign(dossier, updateDossierDto);

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

    this.checkDossierAccess(dossier, user);

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
    const unpaidFactures = dossier.factures.filter(facture => !facture.is_paid);
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
    return `DOS-${year}-${sequence}`;
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
}