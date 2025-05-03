// src/core/document/document-type.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentType } from './entities/document-type.entity';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

@Injectable()
export class DocumentTypeService {
  constructor(
    @InjectRepository(DocumentType)
    private repository: Repository<DocumentType>,
  ) {}

  async create(createDto: CreateDocumentTypeDto): Promise<DocumentType> {
    /*const type_customer = await this.TypeCutomerService.findOne(createDto.type_customer_id! );
    if (!type_customer) {
      throw new NotFoundException(`Le type de client n'existe pas`);
    }
    const documentType = this.repository.create({
      ...createDto,
      type_customer
      });*/
    return this.repository.save(createDto);
  }

  async findAll(): Promise<DocumentType[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<DocumentType> {
    const documentType = await this.repository.findOne({where : { id }});
    if (!documentType) {
      throw new NotFoundException(`DocumentType with ID ${id} not found`);
    }
    return documentType;
  }

  async update(id: number, updateDto: UpdateDocumentTypeDto): Promise<DocumentType> {
    await this.repository.update(id, updateDto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}