import { plainToInstance } from 'class-transformer';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { CustomersService } from 'src/modules/customer/customer/customer.service';

import { CustomerResponseDto } from 'src/modules/customer/customer/dto/customer-response.dto';
import { Customer, CustomerStatus } from 'src/modules/customer/customer/entities/customer.entity';




import { DocumentCategoryService } from 'src/modules/document-category/document-category.service';

import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { DossiersService } from 'src/modules/dossiers/dossiers.service';







import { DossierResponseDto } from 'src/modules/dossiers/dto/dossier-response.dto';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';







import { Repository } from 'typeorm';

import {
  BadRequestException,
  forwardRef,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';








import { InjectRepository } from '@nestjs/typeorm';




import { DocumentType } from '../document-type/entities/document-type.entity';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { CreateDocumentFromCotiDto, KycSyncDto } from './dto/create-document-from-coti.dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { DocumentCustomer, DocumentCustomerStatus } from './entities/document-customer.entity';
































export class DocumentCustomerService   extends BaseServiceV1<DocumentCustomer>  {
  constructor(
    @InjectRepository(DocumentCustomer)
    private docRepository: Repository<DocumentCustomer>,
    
    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,    

    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @Inject(forwardRef(() => CustomersService))
    private customerService: CustomersService,
    @Inject(forwardRef(() => DossiersService))
    private dossierService: DossiersService,
    protected readonly paginationService: PaginationServiceV1,
    private documentCategoryService: DocumentCategoryService,
  ) {    
        super(docRepository, paginationService);console.log(forwardRef)
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      // Champs pour la recherche globale (texte)
      searchFields: [
        'name',
        'description',
        'document_type.name',
        'document_type.code',
        'customer.customer_code',
        'customer.last_name',
        'customer.first_name',
        'customer.company_name',
        'dossier.object',
        'uploaded_by.first_name',
        'uploaded_by.last_name',
        'metadata.keywords'
      ],
      
      // Champs pour recherche exacte
      exactMatchFields: [
        'id',
        'status',
        'category',
        'version',
        'is_current_version',
        'required_for_hearing',
        'is_confidential',
        'document_type_id',
        'dossier_id',
        'customer_id',
        'uploaded_by_id',
        'previous_version_id'
      ],
      
      // Champs pour ranges de dates
      dateRangeFields: [
        'uploaded_at',
        'last_modified',
        'date_validation',
        'date_ejected',
        'date_expired'
      ],
      
  
      
      // Champs de relations pour filtrage
      relationFields: [
        'document_type',
        'customer', 
        'category', 
        'dossier',
        'uploaded_by',
        'previous_version'
      ],
  
    };
  }


async findOne(id: number): Promise<DocumentCustomerResponseDto> {
    const document = await this.repository.findOne({
      where: { id },
      relations: ['customer', 'document_type', 'uploaded_by', 'dossier', 'category'], // si tu veux inclure les relations
    });

    if (!document) {
      throw new NotFoundException(`Document avec l'ID ${id} introuvable`);
    }


    return plainToInstance(DocumentCustomerResponseDto, document);
  }
  /*async create(dto: CreateDocumentCustomerDto, customer_id = null): Promise<any> {
    const file = dto.file!
    const docType = await this.docTypeRepository.findOneBy({ id: dto.document_type_id });
    if (!docType) {
      if(!dto.strict)
        return
      throw new NotFoundException('Type document non trouvé');
    }    
    const customer  = await this.customerRepository.findOne({ where: { id: dto.customer_id }, relations: ['type_customer', 'type_customer.requiredDocuments'] });

    if (!customer) {
      if(!dto.strict)
        return
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
    if(!requiredDocument ){
      if(!dto.strict)
        return
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
      if(!dto.strict)
        return
      throw new ConflictException(`Document : ${getSimilarDocs[0].name} deja soumis ou validé`);
    } 

    if (!file) {
      if(!dto.strict)
        return
      throw new BadRequestException('Aucun fichier uploadé');
    }

    if (!file.mimetype.startsWith(docType.mimetype)) {
      if(!dto.strict)
        return
      throw new BadRequestException(`le fichier doit être de type : ${docType.mimetype}`);
    }

    if (file.size > 1024 * 1024 * 3) { 
      if(!dto.strict)
        return
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
    const doc = await  plainToInstance(DocumentCustomerResponseDto, this.docRepository.save(document));
    console.log('DOC--- ',doc)
    if(dto.status){ 
      this.validate(doc.id)
    }
    return doc
  }*/




/**
   * Recherche avancée de documents avec jointures
   */
  private async searchDocuments(params: {
    documentTypeId?: number;
    customerId?: number;
    status?: DocumentCustomerStatus | DocumentCustomerStatus[];
  }): Promise<DocumentCustomer[]> {
    const { documentTypeId, customerId, status } = params;
    
    const query = this.docRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.document_type', 'document_type')
      .leftJoinAndSelect('doc.customer', 'customer')
      .leftJoinAndSelect('doc.dossier', 'dossier')
      .leftJoinAndSelect('doc.uploaded_by', 'uploaded_by');

    if (documentTypeId) {
      query.andWhere('document_type.id = :documentTypeId', { documentTypeId });
    }

    if (customerId) {
      query.andWhere('customer.id = :customerId', { customerId });
    }

    if (status) {
      if (Array.isArray(status)) {
        query.andWhere('doc.status IN (:...status)', { status });
      } else {
        query.andWhere('doc.status = :status', { status });
      }
    }

    return query.getMany();
  }


  /**
   * Crée un nouveau document client
   */
  async create(
    createDto: CreateDocumentCustomerDto & { file: Express.Multer.File },
    uploadedByUserId?: number 
  ): Promise<DocumentCustomerResponseDto | any> {
    const {
      document_type_id,
      customer_id,
      category_id,
      dossier_id,
      loan_id,
      file,
      strict = true,
      ...restDto
    } = createDto;

    try {
      // 1. Validation du type de document
      const docType = await this.validateDocumentType(document_type_id, strict);
      if (!docType && !strict) return null;

      // 3. Validation du dossier
      const dossier : DossierResponseDto = await this.validateDossier(dossier_id, strict);
      if (!dossier && !strict) return null;

      // 2. Validation du client et vérification des documents requis
      const customer = await this.validateCustomer(dossier.client.id, document_type_id, strict);
      if (!customer && !strict) return null;
      
      // 2. Validation du client et vérification des documents requis
      if (!category_id) {
        throw new NotFoundException(`Catégorie avec l'ID ${category_id} introuvable`);
      }
      const category = await this.documentCategoryService.findOne(category_id);
      if (!category && !strict) return null;



      // 5. Vérification des documents similaires existants
      const hasSimilarDocs = await this.checkSimilarDocuments(document_type_id, customer_id);
      if (hasSimilarDocs && strict) {
        // throw new ConflictException(`Un document de ce type a déjà été soumis ou validé`);
      }
      if (hasSimilarDocs && !strict) return null;

      // 6. Validation du fichier
      await this.validateFile(file, docType, strict);
      if (!file && strict) {
        throw new BadRequestException('Aucun fichier uploadé');
      }
      if (!file && !strict) return null;

      // 7. Upload du fichier
      const uploadedFile = await this.uploadFile(file, docType);

      // 8. Création du document
      const document = await this.createDocument({
        ...restDto,
        document_type: docType,
        customer,
        category : plainToInstance(DocumentCategory, category),
        dossier: plainToInstance(Dossier, dossier),
        uploadedFile,
        uploadedByUserId
      });

      // 9. Validation automatique si demandée
      if (createDto.status === DocumentCustomerStatus.ACCEPTED) {
        await this.validate(document.id);
      }

      return plainToInstance(DocumentCustomerResponseDto, document);

    } catch (error) {
      if (!strict) return null;
      throw error;
    }
  }

  /**
   * Valide le type de document
   */
  private async validateDocumentType(
    documentTypeId: number, 
    strict: boolean
  ): Promise<any> {
    const docType = await this.docTypeRepository.findOne({
      where: { id: documentTypeId }
    });

    if (!docType && strict) {
      throw new NotFoundException('Type de document non trouvé');
    }

    return docType;
  }

  /**
   * Valide le client et vérifie les documents requis
   */
  private async validateCustomer(
    customerId: number,
    documentTypeId: number,
    strict: boolean
  ): Promise<Customer | any> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['type_customer', 'type_customer.requiredDocuments']
    });

    if (!customer && strict) {
      throw new NotFoundException(`Client ${customerId} non trouvé`);
    }
    if (!customer) return null;

    // Vérification si le type de document est autorisé pour ce type de client
    const isDocumentAllowed = customer.type_customer?.requiredDocuments?.some(
      doc => doc.id === documentTypeId
    );

    // if (!isDocumentAllowed && strict) {
    //   throw new NotAcceptableException(
    //     `Ce type de document n'est pas autorisé pour ce type de client`
    //   );
    // }

    if (!isDocumentAllowed && !strict) return null;

    return customer;
  }

  /**
   * Valide le dossier
   */
  private async validateDossier(dossierId: number, strict: boolean): Promise<Dossier | any> {
    const dossier = await this.dossierService.findOne(dossierId);

    if (!dossier && strict) {
      throw new NotFoundException(`Dossier ${dossierId} non trouvé`);
    }

    return dossier;
  }

 

  /**
   * Vérifie l'existence de documents similaires
   */
  private async checkSimilarDocuments(
    documentTypeId: number,
    customerId: number
  ): Promise<boolean> {
    const similarDocs = await this.searchDocuments({
      documentTypeId,
      customerId,
      status: [DocumentCustomerStatus.ACCEPTED, DocumentCustomerStatus.PENDING]
    });

    return similarDocs.length > 0;
  }

  /**
   * Valide le fichier uploadé
   */
  private async validateFile(
    file: Express.Multer.File,
    docType: DocumentType,
    strict: boolean
  ): Promise<void> {
    if (!file) return;

    // Vérification du type MIME
    if (!file.mimetype.startsWith(docType.mimetype)) {
      if (strict) {
        // throw new BadRequestException(
        //   `Le fichier doit être de type : ${docType.mimetype}`
        // );
      }
      return;
    }

    // Vérification de la taille (3MB max)
    const maxSize = 3 * 1024 * 1024; // 3MB en bytes
    if (file.size > maxSize) {
      if (strict) {
        throw new BadRequestException(
          'Le fichier est trop volumineux (max 3MB)'
        );
      }
    }
  }

  /**
   * Upload le fichier
   */
  private async uploadFile(
    file: Express.Multer.File,
    docType: DocumentType
  ): Promise<{ fileName: string; fileSize: number }> {

    try {
      console.log(UPLOAD_DOCS_PATH)
      return await FilesUtil.uploadFile(file, UPLOAD_DOCS_PATH, docType.mimetype, {
        maxSizeKB: 300, // 3MB
        quality: 70,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Erreur lors de l'upload du fichier: ${error.message}`
      );
    }
  }

  /**
   * Crée l'entité document
   */
  private async createDocument(params: {
    document_type: DocumentType;
    customer: Customer;
    dossier: Dossier;
    uploadedFile: { fileName: string; fileSize: number, fileMimeType?: string };
    uploadedByUserId?: number;
    description?: string;
    name?: string;
    category?: DocumentCategory;
    status?: DocumentCustomerStatus;
    required_for_hearing?: boolean;
    is_confidential?: boolean;
    metadata?: string;
  }): Promise<DocumentCustomer | any> {
    const {
      document_type,
      customer,
      dossier,
      category,
      uploadedFile,
      uploadedByUserId,
      ...restParams
    } = params;
    const documentData: Partial<any> = {
      ...restParams,
      document_type,
      customer,
      dossier,
      name: restParams.name ?? document_type.name,
      file_path: uploadedFile.fileName,
      file_size: uploadedFile.fileSize,
      file_mimetype: uploadedFile.fileMimeType,
      status: restParams.status || DocumentCustomerStatus.PENDING,
      category,
      required_for_hearing: restParams.required_for_hearing || false,
      is_confidential: restParams.is_confidential || false,
    };

    // Gestion des métadonnées
    if (restParams.metadata) {
      try {
        documentData.metadata = typeof restParams.metadata === 'string' 
          ? JSON.parse(restParams.metadata)
          : restParams.metadata;
      } catch (error) {
        documentData.metadata = { error: 'Invalid JSON format' };
      }
    }

    const document = this.docRepository.create(documentData);
    return this.docRepository.save(document);
  }


  async createMany(dto: CreateDocumentCustomerDto[] | any[]): Promise<any> {
    let savedDocs : DocumentCustomerResponseDto []  = [];
    for (const doc of dto) {
      await validateDto(CreateDocumentFromCotiDto, doc)
      savedDocs.push(await this.create(doc))
    }
    return savedDocs


  }




  async findCustomerByCode(code: string): Promise<CustomerResponseDto> {
    return await  this.customerService.findOneByCode(code)
  }


  async findByCustomer(customerId: number, accepted = false): Promise<any[]> {

    let where = accepted
      ? {
          customer: { id: customerId },
          status: DocumentCustomerStatus.ACCEPTED,
        }
      : { customer: { id: customerId } };
    return await this.docRepository.find({
      where,
      relations: ['document_type', 'customer'],
    });
  }

  async findByCustomerCode(customer_code: string, accepted = false, strict = true): Promise<any[]> {
    const customer = await this.customerService.findOneByCode(customer_code,strict)
    if(customer)
      return await this.findByCustomer(customer?.id, accepted)
    return []
  }

  async findByType(typeCode: string): Promise<DocumentCustomer | null> {
    let where = {name: typeCode }
    return this.docRepository.findOne({
      where,
      relations: ['document_type'],
    });
  }
  async findByTypeId(id_customer: number , id_type = 3): Promise<DocumentCustomer | null> {
    return this.docRepository.findOne({
      where: {
        document_type: {
          id: id_type
        },
        customer : {
          id: id_customer
        }
      },
      relations: ['document_type','customer'],
    });
  }

  async findByIds(documentIds: number[]){
      const documents = await this.repository.findByIds(documentIds);
      return documents
  }




  async validate(document_id: number): Promise<DocumentCustomer | any> {
    const doc = await this.docRepository.findOne({
      where :{ id: document_id },
      relations: ['customer'] },
    );
    console.log('findByCustomer', await this.findByCustomer(49, true))
    
    if(!doc)
      throw new  NotFoundException("Document non trouvé");
      console.log('doccccc ', doc)
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

  async sync(dto : KycSyncDto){
    let r : any  = []
    // for (const data of dto.items) {
    //     const docs = plainToInstance(DocumentCustomerResponseDto , await this.findByCustomerCode(data.code_customer,true, false))
    //     if(docs && docs.length > 0){
    //       r.push(docs) 
    //       for (const doc of docs) {
    //         console.log('doc ' ,doc.document_type_id , process.env[`DOC_${doc.document_type_id}`] )
    //         if(process.env[`DOC_${doc.document_type_id}`])
    //           await this.mcotiService.uploadKycToCoti(data.personne_id,{document_type_name : process.env[`DOC_${doc.document_type_id}`] , bank_system_idbank_system : 1 },doc.file_url);
    //       }

    //     }
    // }
    return r
  }

  
}