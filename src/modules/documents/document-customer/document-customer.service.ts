import { plainToInstance } from 'class-transformer';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { Customer, CustomerStatus } from 'src/modules/customer/customer/entities/customer.entity';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { DocumentType } from '../document-type/entities/document-type.entity';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { CreateDocumentFromCotiDto } from './dto/create-document-from-coti.dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { DocumentCustomer, DocumentCustomerStatus } from './entities/document-customer.entity';
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

  async create(dto: CreateDocumentCustomerDto, customer_id = null): Promise<any> {
    const file = dto.file!
    const docType = await this.docTypeRepository.findOneBy({ id: dto.document_type_id });
    if (!docType) {
      throw new NotFoundException('Type document non trouvé');
    }    
    const customer  = await this.customerRepository.findOne({ where: { id: dto.customer_id }, relations: ['type_customer', 'type_customer.requiredDocuments'] });

    if (!customer) {
      throw new NotFoundException(`client ${dto.customer_id} non trouvé`);
    }
    const requiredDocument = customer?.type_customer?.requiredDocuments.find(
      (doc) => String(doc.id) === String(dto.document_type_id)
    );
    console.log('Comparaison des IDs :');
    // return customer?.type_customer?.requiredDocuments
    customer?.type_customer?.requiredDocuments.forEach(doc => {
      console.log('doc.id:', doc.id, 'vs', 'dto:', dto.document_type_id);
    });
    if(!requiredDocument){
      throw new NotAcceptableException(`vous ne pouvez pas soumettre ce type de document `);
    }
    const getSimilarDocs : DocumentCustomer[] = await this.searchWithJoinsAdvanced({
      alias: 'doc',
      // conditions: { status: 1 },
      orConditions: [
        // Groupe OR 1: status = 1
        {
          andConditions: [{ field: 'status', value: DocumentCustomerStatus.ACCEPTED }],
        },
        // Groupe OR 2: (status = 0 ET nom = 'brice')
        {
          andConditions: [
            { field: 'status', value: DocumentCustomerStatus.PENDING },
          ],
        },  
      ],
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
      throw new ConflictException(`Document : ${getSimilarDocs[0].name} deja soumis ou validé`);
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
      status: DocumentCustomerStatus.PENDING,
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


  async findByCustomer(customerId: number, accepted = false): Promise<any[]> {

    let where = accepted
      ? {
          customer: { id: customerId },
          status: DocumentCustomerStatus.ACCEPTED,
        }
      : { customer: { id: customerId } };
    return this.docRepository.find({
      where,
      relations: ['document_type'],
    });
  }

  async findByType(typeCode: string): Promise<DocumentCustomer | null> {
    let where = {name: typeCode }
    return this.docRepository.findOne({
      where,
      relations: ['document_type'],
    });
  }




  async validate(document_id: number): Promise<DocumentCustomer | any> {
    const doc = await this.docRepository.findOne({
      where :{ id: document_id },
      relations: ['customer'] },
    );
    console.log('findByCustomer', await this.findByCustomer(49, true))
    
    if(!doc)
      throw new  NotFoundException("Document non trouvé");
    if(doc.status !== DocumentCustomerStatus.PENDING)
      throw new  NotFoundException("Document déja traité");

    this.docRepository.update(document_id, { status: DocumentCustomerStatus.ACCEPTED, date_validation: new Date() } as any)
    doc.status = DocumentCustomerStatus.ACCEPTED;
    doc.date_validation = new Date();
    await this.docRepository.save(doc)
    const customer  = await this.customerRepository.findOne({ where: { id: doc.customer.id }, relations: ['type_customer', 'type_customer.requiredDocuments'] });
    const validateDocs = await this.findByCustomer(customer!.id, true);
    console.log('validateDocs.length', validateDocs.length)
    console.log('customer?.type_customer.requiredDocuments.length', customer?.type_customer.requiredDocuments.length)
    if (validateDocs.length === customer?.type_customer.requiredDocuments.length) {
        await this.customerRepository.update(customer.id, {
          status: CustomerStatus.ACTIVE,
        })
    }
  
    return doc;
  }


  async refuse(document_id: number): Promise<DocumentCustomer | null> {
    const doc = await this.docRepository.findOne({
      where :{ id: document_id },
      relations: ['customer'] },
    );
    if(!doc)
      throw new  NotFoundException("Document non trouvé");
    console.log('doc------- ',doc)
    if(doc.status != DocumentCustomerStatus.PENDING)
      throw new  NotFoundException("Document déja traité");
    doc.status = DocumentCustomerStatus.REFUSED
    doc.date_ejected = new Date()

    await this.docRepository.save(doc)
    // this.docRepository.update(document_id, { status: DocumentCustomerStatus.REFUSED, date_ejected: new Date() } as any)
    return await this.docRepository.findOneBy({ id: document_id });
  }

  getRepository(): Repository<DocumentCustomer> {
    return this.docRepository;
  }
}