import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { DocumentCustomer } from './entities/document-customer.entity';
import { DocumentType, DocumentTypeStatus } from '../document-type/entities/document-type.entity';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { plainToInstance } from 'class-transformer';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { CreateDocumentFromCotiDto } from './dto/create-document-from-coti.dto';
import { FilesUtil } from 'src/core/shared/utils/file.util';
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
      throw new ConflictException(`Document : ${getSimilarDocs[0].name} deja soumis`);
    } 

    if (!file) {
      throw new BadRequestException('Aucun fichier uploadé');
    }

    if (!file.mimetype.startsWith(docType.mimetype)) {
      throw new BadRequestException(`le fichier doit être de type : ${docType.mimetype}`);
    }

    if (file.size > 1024 * 1024 * 3) { 
      throw new BadRequestException('Le fichier est trop volumineux (max 1MB)');
    }
    
    const uploadedFile = await FilesUtil.uploadFile(
      file,
      UPLOAD_DOCS_PATH,
      docType.mimetype,
      {
      maxSizeKB: 1024*1024*2, 
      width: 1024, 
    }
    );

    const document = this.docRepository.create({
      ...dto,
      document_type: docType,
      customer: customer,
      file_path: uploadedFile.fileName,
      file_size: uploadedFile.fileSize,
      name: docType.name,
      status: DocumentTypeStatus.PENDING,
    });
     return plainToInstance(DocumentCustomerResponseDto, this.docRepository.save(document));
  }

  async createMany(dto: CreateDocumentCustomerDto[] | any[]): Promise<any> {
    let savedDocs : DocumentCustomerResponseDto []  = [];
    for (const doc of dto) {
      await validateDto(CreateDocumentFromCotiDto, doc)
      savedDocs.push(await this.create(doc))
    }
    return savedDocs


  }



  async findByCustomer(customerId: number): Promise<DocumentCustomer[]> {
    return this.docRepository.find({
      where: { customer: { id: customerId } },
      relations: ['document_type'],
    });
  }

  async validate(document_id: number): Promise<DocumentCustomer | any> {
    const doc = await this.docRepository.findOneBy({ id: document_id })
    if(!doc)
      throw new  NotFoundException("Document non trouvé");
    
    doc.status =  DocumentTypeStatus.ACCEPTED
    doc.date_validation = new Date() 

    this.docRepository.update(document_id, { status: DocumentTypeStatus.ACCEPTED, date_validation: new Date() } as any)
    const customer  = await this.customerRepository.findOne({ where: { id: doc.id }, relations: ['type_customer'] });
    return customer
    /*for (const element of customer.re) {
      
    }*/
    return await this.docRepository.findOneBy({ id: document_id });
  }

  async refuse(document_id: number): Promise<DocumentCustomer | null> {
    this.docRepository.update(document_id, { status: DocumentTypeStatus.REFUSED, date_ejected: new Date() } as any)
    return await this.docRepository.findOneBy({ id: document_id });
  }

  getRepository(): Repository<DocumentCustomer> {
    return this.docRepository;
  }
}