import { plainToInstance } from 'class-transformer';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { McotiService } from 'src/core/shared/services/mCoti/mcoti.service';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { CustomersService } from 'src/modules/customer/customer/customer.service';
import { Customer, CustomerStatus } from 'src/modules/customer/customer/entities/customer.entity';
import { In, Repository } from 'typeorm';

import { BadRequestException, ConflictException, ForbiddenException, forwardRef, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';


import { DocumentType } from '../document-type/entities/document-type.entity';
import { CreateDocumentCustomerDto } from './dto/create-document-customer.dto';
import { CreateDocumentFromCotiDto, KycSyncDto } from './dto/create-document-from-coti.dto';
import { DocumentCustomerResponseDto } from './dto/document-customer-response.dto';
import { DocumentCustomer, DocumentCustomerStatus } from './entities/document-customer.entity';
import { CustomerResponseDto } from 'src/modules/customer/customer/dto/customer-response.dto';
import { DocumentCategory } from 'src/core/enums/document-category.enum';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { UsersService } from 'src/modules/iam/user/user.service';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';




export class DocumentCustomerService extends BaseService<DocumentCustomer> {
  constructor(
    @InjectRepository(DocumentCustomer)
    private docRepository: Repository<DocumentCustomer>,
    
    @InjectRepository(DocumentType)
    private docTypeRepository: Repository<DocumentType>,    

    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @Inject(forwardRef(() => CustomersService))
    private customerService: CustomersService,
    private usersService: UsersService,
    private mcotiService: McotiService,
  ) {    
    super();
    console.log(forwardRef)
  }

async create(dto: CreateDocumentCustomerDto, uploadedByUserId: number): Promise<any> {
  const file = dto.file;
  
  // ✅ Vérification du fichier
  if (!file) {
    if (!dto.strict) return;
    throw new BadRequestException('Aucun fichier uploadé');
  }

  // ✅ Vérification du type de document
  const docType = await this.docTypeRepository.findOneBy({ id: dto.document_type_id });
  if (!docType) {
    if (!dto.strict) return;
    throw new NotFoundException('Type de document non trouvé');
  }

  // ✅ Vérification du dossier (obligatoire selon specs R1)
  const dossier = new Dossier /*await this.dossierRepository.findOne({ 
    where: { id: dto.dossier_id },
    relations: ['client', 'avocat']
  });*/
  
  if (!dossier) {
    if (!dto.strict) return;
    throw new NotFoundException(`Dossier ${dto.dossier_id} non trouvé`);
  }

  // ✅ Vérification de l'utilisateur qui upload
  const uploadedBy = await this.usersService.findOne(uploadedByUserId) //this.userRepository.findOneBy({ id: uploadedByUserId });
  if (!uploadedBy) {
    if (!dto.strict) return;
    throw new NotFoundException(`Utilisateur ${uploadedByUserId} non trouvé`);
  }

  // ✅ Vérification des droits selon le rôle (RBAC - R7)
  const userRoles = [uploadedBy.role]; // Récupérer les rôles de l'utilisateur
  const allowedRoles = ['admin', 'avocat', 'secretaire', 'client'];
  
  if (!userRoles.some(role => allowedRoles.includes(role))) {
    if (!dto.strict) return;
    throw new ForbiddenException('Droits insuffisants pour uploader un document');
  }

  // ✅ Vérification du format et taille du fichier
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    if (!dto.strict) return;
    throw new BadRequestException(`Type de fichier non autorisé. Types acceptés: ${allowedMimeTypes.join(', ')}`);
  }

  // ✅ Vérification de la taille (50MB max selon specs)
  const maxFileSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxFileSize) {
    if (!dto.strict) return;
    throw new BadRequestException(`Le fichier est trop volumineux (max ${maxFileSize / 1024 / 1024}MB)`);
  }

  // ✅ Vérification des doublons (versionning)
  const existingDocuments = await this.docRepository.find({
    where: {
      dossier: { id: dto.dossier_id },
      document_type: { id: dto.document_type_id },
      status: In([DocumentCustomerStatus.PENDING, DocumentCustomerStatus.VALIDATED])
    },
    relations: ['documentType', 'dossier']
  });

  if (existingDocuments.length > 0 && !dto.allowMultiple) {
    if (!dto.strict) return;
    throw new ConflictException(`Un document de ce type existe déjà dans ce dossier`);
  }

  // ✅ Vérification spécifique pour les actes de procédure (R2)
  if (dto.category === DocumentCategory.PROCEDURE && dto.audience_id) {
    const audience = new Audience /*await this.audienceRepository.findOne({
      where: { id: dto.audience_id },
      relations: ['dossier']
    });*/
    
    if (!audience) {
      if (!dto.strict) return;
      throw new NotFoundException(`Audience ${dto.audience_id} non trouvée`);
    }
    
    // Vérifier que l'audience appartient bien au dossier
    if (audience.dossier.id !== dto.dossier_id) {
      if (!dto.strict) return;
      throw new BadRequestException('L\'audience ne correspond pas au dossier');
    }
  }

  // ✅ Upload du fichier
  const uploadPath = process.env.UPLOAD_DOCS_PATH || './uploads/documents';
  const uploadedFile = await FilesUtil.uploadFile(
    file,
    uploadPath,
    file.mimetype,
    {
      maxSizeKB: maxFileSize / 1024,
      // generateThumbnail: file.mimetype.startsWith('image/'),
      // allowedMimeTypes: allowedMimeTypes
    }
  );

  // ✅ Génération des métadonnées pour la recherche
  const keywords = this.generateKeywords(dto, docType, dossier);
  
  // ✅ Création du document
  const documentData: Partial<DocumentCustomer> = {
    filename: uploadedFile.fileName,
    originalName: file.originalname,
    // filePath: uploadedFile.fileName || uploadedFile.fileName,
    fileSize: uploadedFile.fileSize,
    mimeType: file.mimetype,
    document_type: docType,
    category: dto.category || this.determineCategory(docType),
    dossier: dossier,
    customer: dossier.client, // Récupéré depuis le dossier
    uploadedBy: plainToInstance(User,uploadedBy),
    audience: dto.audience_id ? { id: dto.audience_id } as any : null,
    description: dto.description,
    keywords: keywords,
    documentDate: dto.document_date || new Date(),
    status: dto.autoValidate ? DocumentCustomerStatus.VALIDATED : DocumentCustomerStatus.PENDING,
    version: 1
  };

  const document = this.docRepository.create(documentData);
  const savedDocument = await this.docRepository.save(document);

  // ✅ Si validation automatique demandée
  if (dto.autoValidate) {
    savedDocument.validationDate = new Date();
    await this.docRepository.save(savedDocument);
  }

  // ✅ Notification si nécessaire (spécs 4.5)
  if (this.shouldNotify(dto.category, savedDocument.status)) {
    // await this.notificationService.notifyDocumentUpload(savedDocument);
  }

  // ✅ Journalisation (spécs 4.7)
  /*await this.activityLogService.logDocumentUpload(
    uploadedBy,
    savedDocument,
    dossier
  );*/

  return plainToInstance(DocumentCustomerResponseDto, savedDocument);
}

// ✅ Méthodes helper
private generateKeywords(dto: CreateDocumentCustomerDto, docType: DocumentType, dossier: Dossier): string {
  const keywords = [
    docType.name,
    dto.category,
    dossier.procedure_type?.name,
    dossier.client?.full_name,
    dossier.lawyer?.full_name
  ].filter(Boolean).join(', ');
  
  return keywords;
}

private determineCategory(docType: DocumentType): DocumentCategory {
  // Logique pour déterminer la catégorie basée sur le type de document
  const procedureTypes = ['assignation', 'requete', 'conclusion', 'memoire'];
  const audienceTypes = ['convocation', 'jugement', 'arrete'];
  
  if (procedureTypes.some(type => docType.name.toLowerCase().includes(type))) {
    return DocumentCategory.PROCEDURE;
  }
  
  if (audienceTypes.some(type => docType.name.toLowerCase().includes(type))) {
    return DocumentCategory.AUDIENCE;
  }
  
  if (docType.name.toLowerCase().includes('facture')) {
    return DocumentCategory.FACTURE;
  }
  
  return DocumentCategory.CLIENT;
}

private shouldNotify(category: DocumentCategory, status: DocumentCustomerStatus): boolean {
  // Notifier pour les documents importants ou validés
  const importantCategories = [
    DocumentCategory.PROCEDURE,
    DocumentCategory.AUDIENCE,
    // DocumentCategory.DECISION
  ];
  
  return importantCategories.includes(category) && status === DocumentCustomerStatus.VALIDATED;
}


  async createMany(dto: CreateDocumentCustomerDto[] | any[], uploadedByUserId: number): Promise<any> {
    let savedDocs : DocumentCustomerResponseDto []  = [];
    for (const doc of dto) {
      await validateDto(CreateDocumentFromCotiDto, doc)
      savedDocs.push(await this.create(doc, uploadedByUserId))
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
    return this.docRepository.find({
      where,
      relations: ['document_type'],
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
    for (const data of dto.items) {
        const docs = plainToInstance(DocumentCustomerResponseDto , await this.findByCustomerCode(data.code_customer,true, false))
        if(docs && docs.length > 0){
          r.push(docs) 
          for (const doc of docs) {
            console.log('doc ' ,doc.document_type_id , process.env[`DOC_${doc.document_type_id}`] )
            if(process.env[`DOC_${doc.document_type_id}`])
              await this.mcotiService.uploadKycToCoti(data.personne_id,{document_type_name : process.env[`DOC_${doc.document_type_id}`] , bank_system_idbank_system : 1 },doc.file_url);
          }

        }
    }
    return r
  }

  
}