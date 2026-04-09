// src/core/document/document-type.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';


import { InjectRepository } from '@nestjs/typeorm';


import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentTypeResponseDto } from './dto/ressponse-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentType } from './entities/document-type.entity';





@Injectable()
export class DocumentTypeService  extends BaseServiceV1<DocumentType>{
  constructor(
      protected readonly paginationService: PaginationServiceV1,
        @InjectRepository(DocumentType)
    protected repository: Repository<DocumentType>,
  ) {    
    super(repository, paginationService);}

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['code', 'name', 'description'],
      exactMatchFields: ['status'],
      dateRangeFields: [ 'created_at'],
      relationFields: ['documents'],
    };
  }

  async create(createDto: CreateDocumentTypeDto): Promise<DocumentType> {
    return this.repository.save(createDto);
  }


  async findAll(): Promise<DocumentType[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<DocumentTypeResponseDto> {
    const document_type = await this.repository.findOne({where : { id }});
    if (!document_type) {
      throw new NotFoundException(`DocumentType with ID ${id} not found`);
    }
    return plainToInstance(DocumentTypeResponseDto,document_type);
  }

  async update(id: number, updateDto: UpdateDocumentTypeDto): Promise<DocumentTypeResponseDto> {
    await this.repository.update(id, updateDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}