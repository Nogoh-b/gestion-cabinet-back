import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { DocumentSavingAccount } from 'src/modules/savings-account/document-saving-account/entities/document-saving-account.entity';
import { In, Repository } from 'typeorm';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
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
  ) {}
  /** Valide un document (status -> ACCEPTED) */
  async validateDocument(id: number): Promise<DocumentSavingAccount> {
    const doc = await this.findOne(id);
    if (doc.status !== DocumentSavingAccountStatus.PENDING) {
      throw new BadRequestException('Seul un document en attente peut être validé');
    }
    doc.status = DocumentSavingAccountStatus.ACCEPTED;
    doc.date_validation = new Date();
    return this.repo.save(doc);
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
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);
    return doc;
  }

    async createSingle(
    dto: CreateDocumentSavingAccountDto,
    file: Express.Multer.File,
  ): Promise<DocumentSavingAccount> {
    // Vérification des jointures
    const customer = await this.customerRepo.findOneBy({ id: dto.customer_id });
    if (!customer) throw new NotFoundException(`Client ${dto.customer_id} introuvable`);

    const docType = await this.docTypeRepo.findOneBy({ id: dto.document_type_id });
    if (!docType) throw new NotFoundException(`Type de document ${dto.document_type_id} introuvable`);

    // Vérifier s'il existe déjà un document en attente ou validé pour ce client et type
    const existing = await this.repo.findOne({
      where: {
        customer: { id: dto.customer_id },
        document_type: { id: dto.document_type_id },
        status: In([
          DocumentSavingAccountStatus.PENDING,
          DocumentSavingAccountStatus.ACCEPTED,
        ]),
      },
      relations: ['customer', 'document_type'],
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
    entity.customer = customer;
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
