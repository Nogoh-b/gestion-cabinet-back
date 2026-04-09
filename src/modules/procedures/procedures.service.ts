// src/modules/procedures/procedures.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { ProcedureSearchDto } from './dto/procedure-search.dto';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { plainToInstance } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { ProcedureType } from './entities/procedure.entity';
import { ProcedureTypeResponseDto } from './dto/procedure-type-response';
import { CreateProcedureTypeDto } from './dto/create-procedure.dto';
import { UpdateProcedureTypeDto } from './dto/update-procedure.dto';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { ProcedureTemplateService } from '../procedure/services/procedure-template.service';
import { ProcedureTemplate } from '../procedure/entities/procedure-template.entity';

@Injectable()
export class ProceduresService extends BaseServiceV1<ProcedureType> {
  constructor(
    @InjectRepository(ProcedureType)
    private readonly procedureTypeRepository: Repository<ProcedureType>,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    protected readonly paginationService: PaginationServiceV1,
    protected readonly procedureTemplateService: ProcedureTemplateService,

  ) {
      super(procedureTypeRepository, paginationService);

  }
  getDefaultSearchOptions(): SearchOptions {
    return {
      // Champs sur lesquels la recherche textuelle sera effectuée
      searchFields: ['name', 'code', 'description'],
      
      // Relations à inclure dans la recherche/filtrage
      relationFields: ['parent', 'subtypes', 'dossiers', 'procedure_template'],
      
      // Champs où la recherche doit être exacte (pas de LIKE)
      exactMatchFields: ['code', 'is_active', 'parent_id', 'hierarchy_level'],
      
      // Champs de date pour les filtres de période
      dateRangeFields: ['created_at', 'updated_at'],
    };
  }
  async create(createProcedureTypeDto: CreateProcedureTypeDto): Promise<ProcedureTypeResponseDto> {

    if(createProcedureTypeDto.parent_id)
      return this.createSubtype(createProcedureTypeDto.parent_id, createProcedureTypeDto)
    // Vérifier l'unicité du code
    const existingCode = await this.procedureTypeRepository.findOne({
      where: { code: createProcedureTypeDto.code }
    });
    let template : ProcedureTemplate; 
    if(createProcedureTypeDto.procedure_template_id){
      template = await this.procedureTemplateService.findOne(createProcedureTypeDto.procedure_template_id);
      if(!template){
        throw new NotFoundException(`Template de procédure avec ID ${createProcedureTypeDto.procedure_template_id} non trouvé`);
      }
    }

    if (existingCode) {
      throw new ConflictException('Un type de procédure avec ce code existe déjà');
    }

    const procedureType = this.procedureTypeRepository.create({
      ...createProcedureTypeDto,
      is_subtype: false,
      hierarchy_level: 1
    });

    const savedProcedure = await this.procedureTypeRepository.save(procedureType);
    return this.mapToResponseDto(savedProcedure);
  }

  async createSubtype(parentId: number, createProcedureTypeDto: CreateProcedureTypeDto): Promise<ProcedureTypeResponseDto> {
    const parent = await this.procedureTypeRepository.findOne({
      where: { id: parentId, is_subtype: false }
    });

    if (!parent) {
      throw new NotFoundException('Type de procédure parent non trouvé');
    }

    // Vérifier l'unicité du code
    const existingCode = await this.procedureTypeRepository.findOne({
      where: { code: createProcedureTypeDto.code }
    });

    if (existingCode) {
      throw new ConflictException('Un type de procédure avec ce code existe déjà');
    }

    const subtype = this.procedureTypeRepository.create({
      ...createProcedureTypeDto,
      is_subtype: true,
      hierarchy_level: 2,
      parent: parent
    });

    const savedSubtype = await this.procedureTypeRepository.save(subtype);
    return this.mapToResponseDto(savedSubtype);
  }

  async findAll(searchDto: ProcedureSearchDto): Promise<ProcedureTypeResponseDto[]> {
    const where: FindOptionsWhere<ProcedureType> = {};

    if (searchDto.search) {
      where.name = Like(`%${searchDto.search}%`);
    }

    /*if (searchDto.category) {
      where.category = searchDto.category;
    }*/

    if (searchDto.is_subtype) {
      where.is_subtype = false;
    }

    if (searchDto.is_subtype) {
      where.is_subtype = true;
    }

    if (searchDto.parent_id) {
      where.parent = { id: searchDto.parent_id };
    }

    if (searchDto.is_active !== undefined && searchDto.is_active !== null) {
      // where.is_active =
      //   searchDto.is_active === true ;
    }

    console.log('Search DTO:', where);
    const procedures = await this.procedureTypeRepository.find({
      where,
      relations: ['parent', 'subtypes'],
      order: { 
        hierarchy_level: 'ASC',
        name: 'ASC'
      }
    });

    return Promise.all(procedures.map(procedure => this.mapToResponseDto(procedure)));
  }

  async findOne(id: number): Promise<ProcedureTypeResponseDto> {
    const procedureType = await this.procedureTypeRepository.findOne({
      where: { id },
      relations: ['parent', 'subtypes' , 'dossiers']
    });

    if (!procedureType) {
      throw new NotFoundException(`Type de procédure ${id} non trouvé`);
    }

    return plainToInstance(ProcedureTypeResponseDto,procedureType);
  }

  async getMainTypes(): Promise<ProcedureTypeResponseDto[]> {
    const mainTypes = await this.procedureTypeRepository.find({
      where: { 
        is_subtype: false,
        is_active: true
      },
      relations: ['subtypes'],
      order: { name: 'ASC' }
    });

    return Promise.all(mainTypes.map(type => this.mapToResponseDto(type)));
  }

  async getSubtypes(parentId: number): Promise<ProcedureTypeResponseDto[]> {
    const parent = await this.procedureTypeRepository.findOne({
      where: { id: parentId }
    });

    if (!parent) {
      throw new NotFoundException('Type de procédure parent non trouvé');
    }

    const subtypes = await this.procedureTypeRepository.find({
      where: { 
        parent: { id: parentId },
        is_active: true
      },
      order: { name: 'ASC' }
    });

    return Promise.all(subtypes.map(subtype => this.mapToResponseDto(subtype)));
  }

 async update(id: number, updateProcedureTypeDto: UpdateProcedureTypeDto): Promise<ProcedureTypeResponseDto> {
  const procedureType = await this.procedureTypeRepository.findOne({
    where: { id },
    relations: ['parent', 'subtypes', 'procedure_template'] // Ajouter procedure_template
  });

  if (!procedureType) {
    throw new NotFoundException(`Type de procédure ${id} non trouvé`);
  }

  // Vérifier l'unicité du code si modification
  if (updateProcedureTypeDto.code && updateProcedureTypeDto.code !== procedureType.code) {
    const existingCode = await this.procedureTypeRepository.findOne({
      where: { code: updateProcedureTypeDto.code }
    });

    if (existingCode) {
      throw new ConflictException('Un type de procédure avec ce code existe déjà');
    }
  }

  // Gestion du parent pour les sous-types
  if (updateProcedureTypeDto.parent_id) {
    const parent = await this.procedureTypeRepository.findOne({
      where: { id: updateProcedureTypeDto.parent_id }
    });

    if (!parent) {
      throw new NotFoundException('Type de procédure parent non trouvé');
    }

    procedureType.parent = parent;
    procedureType.is_subtype = true;
    procedureType.hierarchy_level = 2;
  }

  // Gestion du template de procédure
  if (updateProcedureTypeDto.procedure_template_id) {
    // Vérifier que le template existe
    const template = await this.procedureTemplateService.findOne(
      updateProcedureTypeDto.procedure_template_id 
    );

    if (!template) {
      throw new NotFoundException(`Template de procédure ${updateProcedureTypeDto.procedure_template_id} non trouvé`);
    }

    procedureType.procedure_template = template;
  }

  // Ne pas oublier de gérer specific_jurisdictions
  if (updateProcedureTypeDto.specific_jurisdictions) {
    // Si c'est une string JSON, la parser
    if (typeof updateProcedureTypeDto.specific_jurisdictions === 'string') {
      try {
        procedureType.specific_jurisdictions = JSON.parse(updateProcedureTypeDto.specific_jurisdictions);
      } catch(e) {
        procedureType.specific_jurisdictions = [];
      }
    } else {
      procedureType.specific_jurisdictions = updateProcedureTypeDto.specific_jurisdictions;
    }
  }

  // Mettre à jour les autres propriétés
  Object.assign(procedureType, updateProcedureTypeDto);
  
  const updatedProcedure = await this.procedureTypeRepository.save(procedureType);
  return this.mapToResponseDto(updatedProcedure);
}

  async remove(id: number): Promise<void> {
    const procedureType = await this.procedureTypeRepository.findOne({
      where: { id },
      relations: ['subtypes', 'dossiers']
    });

    if (!procedureType) {
      throw new NotFoundException(`Type de procédure ${id} non trouvé`);
    }

    // Vérifier s'il est utilisé dans des dossiers
    const dossierCount = await this.dossierRepository.count({
      where: [
        { procedure_type: { id } },
        { procedure_subtype: { id } }
      ]
    });

    if (dossierCount > 0) {
      throw new BadRequestException('Impossible de supprimer un type de procédure utilisé dans des dossiers');
    }

    // Vérifier s'il a des sous-types
    if (procedureType.subtypes && procedureType.subtypes.length > 0) {
      throw new BadRequestException('Impossible de supprimer un type de procédure ayant des sous-types');
    }

    await this.procedureTypeRepository.softDelete(id);
  }

  async validateTypeSubtype(typeId: number, subtypeId: number): Promise<boolean> {
    const subtype = await this.procedureTypeRepository.findOne({
      where: { id: subtypeId },
      relations: ['parent']
    });

    return !!subtype && subtype.parent_id === typeId;
  }

  async getStatistics(): Promise<any> {
    const stats = await this.procedureTypeRepository
      .createQueryBuilder('procedure_type')
      .leftJoin('procedure_type.dossiers', 'dossier')
      .select('procedure_type.name', 'name')
      .addSelect('procedure_type.code', 'code')
      .addSelect('COUNT(dossier.id)', 'dossier_count')
      .where('procedure_type.is_subtype = :isSubtype', { isSubtype: false })
      .andWhere('procedure_type.is_active = :isActive', { isActive: true })
      .groupBy('procedure_type.id, procedure_type.name, procedure_type.code')
      .orderBy('dossier_count', 'DESC')
      .getRawMany();

    const totalDossiers = await this.dossierRepository.count();

    return {
      by_procedure_type: stats,
      total_procedure_types: await this.procedureTypeRepository.count({ where: { is_active: true } }),
      total_main_types: await this.procedureTypeRepository.count({ where: { is_subtype: false, is_active: true } }),
      total_subtypes: await this.procedureTypeRepository.count({ where: { is_subtype: true, is_active: true } }),
      total_dossiers: totalDossiers
    };
  }

  private async mapToResponseDto(procedureType: ProcedureType): Promise<ProcedureTypeResponseDto> {
    const dossierCount = await this.dossierRepository.count({
      where: [
        { procedure_type: { id: procedureType.id } },
        { procedure_subtype: { id: procedureType.id } }
      ]
    });

    return plainToInstance(ProcedureTypeResponseDto, {
      ...procedureType,
      dossier_count: dossierCount,
      full_path: procedureType.full_path,
      is_main_type: procedureType.is_main_type
    });
  }
}