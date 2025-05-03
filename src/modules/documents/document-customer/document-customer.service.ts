import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { DocumentCustomer } from './entities/document-customer.entity';
import { DocumentType } from '../document-type/entities/document-type.entity';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class DocumentCustomerService {
  constructor(
    @InjectRepository(DocumentCustomer)
    private docRepository: Repository<DocumentCustomer>,
    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,
  ) {}

  async create(dto: CreateDocumentCustomerDto, file: Express.Multer.File): Promise<DocumentCustomerResponseDto> {
    const docType = await this.docTypeRepository.findOneBy({ id: dto.documentTypeId });
    if (!docType) {
      throw new NotFoundException('Document type not found');
    }
    const fileName = `${Date.now()}-${file.originalname}`;
    const file_path = join(UPLOAD_DOCS_PATH, fileName);

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(file_path);
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
      stream.end(file.buffer); 
    });
    const document = this.docRepository.create({
      ...dto,
      documentType: docType,
      file_path: fileName,
    });
     return plainToInstance(DocumentCustomerResponseDto, this.docRepository.save(document));
  }

  async findByCustomer(customerId: number): Promise<DocumentCustomer[]> {
    return this.docRepository.find({
      where: { customer: { id: customerId } },
      relations: ['documentType'],
    });
  }
}