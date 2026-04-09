// type-customers.service.ts
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { AssignDocumentsToTypeDto } from 'src/modules/documents/shared/assign-documents-to-type.dto';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';







import { CreateTypeCustomerDto } from './dto/create-type_customer.dto';
import { UpdateTypeCustomerDto } from './dto/update-type_customer.dto';
import { TypeCustomer } from './entities/type_customer.entity';








@Injectable()
export class TypeCustomersService extends BaseServiceV1<TypeCustomer>  {
  constructor(
    @InjectRepository(TypeCustomer)
    protected repository: Repository<TypeCustomer>,
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(DocumentType)
    private document_typeRepository: Repository<DocumentType>
  ) {    
    super(repository, paginationService);
  }

    protected getDefaultSearchOptions(): SearchOptions {
      return {
        // Champs pour la recherche globale
        searchFields: [
          'name',
          'code',
          'status',
        ],
        
        // Champs pour recherche exacte
        // exactMatchFields: [
        //   'id',
        //   'status',
        //   'confidentiality_level',
        //   'priority_level',
        //   'budget_estimate'
        // ],
        
        // Champs pour ranges de dates
        /*dateRangeFields: [
          'created_at',
          'updated_at',
          'opening_date',
          'closing_date'
        ],*/
        
        // Champs de relations pour filtrage
        relationFields: ['customers']
      };
    }

  create(dto: CreateTypeCustomerDto): Promise<TypeCustomer> {
    return this.repository.save(dto);
  }

  findAll(): Promise<TypeCustomer[]> {
    return this.repository.find({relations: ['requiredDocuments']});
  }

  async findOne(id: number): Promise<TypeCustomer> {
    const typeCustomer = await this.repository.findOne({where:{ id }, relations: ['requiredDocuments']});
    
    if (!typeCustomer) {
      throw new NotFoundException(`TypeCustomer with ID ${id} not found`);
    }
    
    return typeCustomer;
  }

  async findOneByCode(code: string): Promise<TypeCustomer> {
    const typeCustomer = await this.repository.findOne({where:{ code }, relations: ['requiredDocuments']});
    
    if (!typeCustomer) {
      throw new NotFoundException(`TypeCustomer with CODE ${code} not found`);
    }
    
    return typeCustomer;
  }

  update(id: number, dto: UpdateTypeCustomerDto): Promise<TypeCustomer> {
    return this.repository.save({ id, ...dto });
  }



  async assignDocuments(typeCustomerId: number, dto: AssignDocumentsToTypeDto) {
    const typeCustomer = await this.typeCustomerRepository.findOne({
      where: { id: typeCustomerId },
      relations: ['requiredDocuments'],
    });

    if (!typeCustomer) {
      throw new NotFoundException(`TypeCustomer with ID ${typeCustomerId} not found`);
    }

    const newDocuments = await this.document_typeRepository.findByIds(dto.document_type_ids);

    // Fusionner sans doublons
    const existingDocIds = new Set(typeCustomer.requiredDocuments.map(doc => doc.id));
    const combinedDocuments = [
      ...typeCustomer.requiredDocuments,
      ...newDocuments.filter(doc => !existingDocIds.has(doc.id)),
    ];

    typeCustomer.requiredDocuments = combinedDocuments;

    return this.typeCustomerRepository.save(typeCustomer);
  }


  async findOneWithDocuments(id: number) {
    return this.typeCustomerRepository.findOne({
      where: { id },
      relations: ['requiredDocuments']
    });
  }
}