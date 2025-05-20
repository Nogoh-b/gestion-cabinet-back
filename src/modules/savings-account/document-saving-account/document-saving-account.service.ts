import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { DocumentSavingAccount } from 'src/modules/savings-account/document-saving-account/entities/document-saving-account.entity';
import { In, Repository } from 'typeorm';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { SavingsAccountService } from '../savings-account/savings-account.service';
export enum DocumentSavingAccountStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}
@Injectable()
export class DocumentSavingAccountService {
  constructor(
    @InjectRepository(DocumentSavingAccount)
    private readonly repo: Repository<DocumentSavingAccount>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(DocumentType)
    private readonly docTypeRepo: Repository<DocumentType>,

    private  saService: SavingsAccountService,

  ) {}
  /** Valide un document (status -> ACCEPTED) */
  async validateDocument(id: number): Promise<DocumentSavingAccount> {
    const doc = await this.findOne(id);
    if (doc.status !== DocumentSavingAccountStatus.PENDING) throw new BadRequestException('Only pending documents can be accepted');

    doc.status = DocumentSavingAccountStatus.ACCEPTED;
    doc.date_validation = new Date();
    await this.repo.save(doc);
    const idSa = doc.savings_account.id;
    const required = await this.saService.getRequiredDocuments(doc.savings_account.id);
    const accepted = await this.repo.find({
      where: {
        savings_account: { id: idSa },
        status: DocumentSavingAccountStatus.ACCEPTED,
      },
      relations: ['document_type'],
    });
    const acceptedIds = new Set(accepted.map(d => d.document_type.id));
    if (required.every(r => acceptedIds.has(r.id))) {
      await this.saService.validateAccount(idSa);
    }
    return doc;
  }

  /** Refuse un document (status -> REFUSED) */
  async refuseDocument(id: number): Promise<DocumentSavingAccount> {
    const doc = await this.findOne(id);
    if (doc.status !== DocumentSavingAccountStatus.PENDING) {
      throw new BadRequestException('Seul un document en attente peut être refusé');
    }
    doc.status = DocumentSavingAccountStatus.REFUSED;
    doc.date_ejected = new Date();
    return this.repo.save(doc);
  }


  async findOne(id: number): Promise<DocumentSavingAccount> {
    const doc = await this.repo.findOne({ where: { id } , relations: ['customer', 'document_type', 'savings_account'] });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);
    return doc;
  }

    async createSingle(
    dto: CreateDocumentSavingAccountDto,
    file: Express.Multer.File,
  ): Promise<DocumentSavingAccount> {
    // Vérification des jointures
    const sa = await this.saService.findOne(dto.savings_account_id);
    if (!sa) throw new NotFoundException(`Savings account ${dto.savings_account_id} not found in branch`);


    const docType = await this.docTypeRepo.findOneBy({ id: dto.document_type_id });
    if (!docType) throw new NotFoundException(`Type de document ${dto.document_type_id} introuvable`);

    const requiredDocs = await this.saService.getRequiredDocuments(sa.id);
    const requiredIds = requiredDocs.map(d => d.id);
    if (!requiredIds.includes(dto.document_type_id)) {
      throw new BadRequestException('This document type is not required for this savings account');
    }
    // Vérifier s'il existe déjà un document en attente ou validé pour ce client et type
    const existing = await this.repo.findOne({
      where: {
        savings_account: { id: dto.savings_account_id},
        document_type: { id: dto.document_type_id },
        status: In([DocumentSavingAccountStatus.PENDING, DocumentSavingAccountStatus.ACCEPTED]),
      },
      relations: ['savings_account', 'document_type'],
    });
    if (existing) {
      throw new ConflictException('Un document est déjà en attente ou validé pour ce type.');
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
    // Construction manuelle pour éviter les conflits de DeepPartial
    const entity = new DocumentSavingAccount();
    entity.name = dto.name;
    entity.document_type = docType;
    entity.status = 0;
    entity.file_path = uploadedFile.fileName;
    entity.file_size = uploadedFile.fileSize;
    entity.savings_account = sa;
    entity.status = DocumentSavingAccountStatus.PENDING;

    return this.repo.save(entity);
  }


  async createMultiple(
    dtos: CreateDocumentSavingAccountDto[],
    files: Express.Multer.File[],
  ): Promise<DocumentSavingAccount[]> {
    const results: DocumentSavingAccount[] = [];
    for (let i = 0; i < dtos.length; i++) {
      results.push(await this.createSingle(dtos[i], files[i]));
    }
    return results;
  }
}
