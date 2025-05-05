import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { DocumentCustomer } from './entities/document-customer.entity';
import { DocumentType } from '../document-type/entities/document-type.entity';
import { join } from 'path';
import { createWriteStream } from 'fs';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { plainToInstance } from 'class-transformer';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';

@Injectable()
export class DocumentCustomerService extends BaseService<DocumentCustomer> {
  constructor(
    @InjectRepository(DocumentCustomer)
    private docRepository: Repository<DocumentCustomer>,
    
    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,    

    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>
  ) {    
    super();
  }

  async create(dto: CreateDocumentCustomerDto, customer_id = null): Promise<DocumentCustomerResponseDto> {
    //  validateDto(CreateDocumentCustomerDto, dto)
    const file = dto.file!
    const docType = await this.docTypeRepository.findOneBy({ id: dto.document_type_id });
    if (!docType) {
      throw new NotFoundException('Type document non trouvé');
    }    
    const customer = await this.customerRepository.findOneBy({ id: dto.customer_id });
    if (!customer) {
      throw new NotFoundException(`client ${dto.customer_id} non trouvé`);
    }
    const getSimilarDocs : DocumentCustomer[] = await this.searchWithJoinsAdvanced({
      alias: 'doc',
      conditions: { status: 1 },
      joins: [
        {
          relation: 'document_type',
          alias: 'doc_type',
          conditions: { id: dto.document_type_id }, 
        },
        {
          relation: 'customer',
          alias: 'cust',
          conditions: { id: dto.customer_id },
        },
      ],
    });
    if (getSimilarDocs.length > 0) {
      throw new NotFoundException(`Document : ${getSimilarDocs[0].name} deja soumis`);
    } 

    
    const fileName = await this.uploadFile(file, UPLOAD_DOCS_PATH);

    const document = this.docRepository.create({
      ...dto,
      document_type: docType,
      customer: customer,
      file_path: fileName,
      name: docType.name,
      status: 1
    });
     return plainToInstance(DocumentCustomerResponseDto, this.docRepository.save(document));
  }

  async createMany(dto: CreateDocumentCustomerDto[] | any[]): Promise<any> {
    let savedDocs : DocumentCustomerResponseDto []  = [];
    for (const doc of dto) {
      savedDocs.push(await this.create(doc))
    }
    return savedDocs


    /*const file = dto.file!
    const docType = await this.docTypeRepository.findOneBy({ id: dto.document_type_id });
    if (!docType) {
      throw new NotFoundException('Document type not found');
    }
    const fileName = await this.uploadFile(file, UPLOAD_DOCS_PATH);
    const document = this.docRepository.create({
      ...dto,
      document_type: docType,
      file_path: fileName,
    });
     return plainToInstance(DocumentCustomerResponseDto, this.docRepository.save(document));*/
  }

  async uploadFile(file, FILE_PATH){
    const fileName = `${Date.now()}-${file.originalname}`;
    const file_path = join(FILE_PATH, fileName);
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(file_path);
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
      stream.end(file.buffer); 
    });
    return fileName;
  }

  async findByCustomer(customerId: number): Promise<DocumentCustomer[]> {
    return this.docRepository.find({
      where: { customer: { id: customerId } },
      relations: ['document_type'],
    });
  }

  getRepository(): Repository<DocumentCustomer> {
    return this.docRepository;
  }
}