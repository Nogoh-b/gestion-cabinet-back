import { plainToInstance } from 'class-transformer';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { PaginatedResult } from 'src/core/shared/interfaces/pagination.interface';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { DocumentSavingAccount } from 'src/modules/savings-account/document-saving-account/entities/document-saving-account.entity';









import { In, Repository } from 'typeorm';

import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';



import { InjectRepository } from '@nestjs/typeorm';












import { SavingsAccountResponseDto } from '../savings-account/dto/response-savings-account.dto';
import { SavingsAccount } from '../savings-account/entities/savings-account.entity';
import { SavingsAccountService } from '../savings-account/savings-account.service';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { DocumentSavingAccountResponseDto } from './dto/response-document-saving-account.dto';

























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
    private paginationService: PaginationService,
    
    @Inject(forwardRef(() => SavingsAccountService))
    private  saService: SavingsAccountService,

  ) {console.log(forwardRef)}
  /** Valide un document (status -> ACCEPTED) */
  async validateDocument(id: number): Promise<DocumentSavingAccountResponseDto> {
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
    const docsStats = await this.saService.getDocumentStatus(idSa)
    if(( docsStats).allRequiredValidated){
    }
    return plainToInstance(DocumentSavingAccountResponseDto, doc);
    const acceptedIds = new Set(accepted.map(d => d.document_type.id));
    if (required.every(r => acceptedIds.has(r.id))) {
      await this.saService.validateAccount(idSa);
    }
  }

    async findAllPendingDocBySavingAcounts(page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string): Promise<PaginatedResult<SavingsAccountResponseDto>> {
      return await this.saService.findAllPendingDocs(
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fields,
      exact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined)
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


  async findOne(id: number): Promise<DocumentSavingAccountResponseDto> {
    const doc = await this.repo.findOne({ where: { id } , relations: ['customer', 'document_type', 'savings_account'] });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);
    return (plainToInstance(DocumentSavingAccountResponseDto, doc) );
  }

  async createSingle(
    dto: CreateDocumentSavingAccountDto,
    file: Express.Multer.File,
  ): Promise<DocumentSavingAccount | any> {
    console.log('---dto---- ',dto)

    // Vérification des jointures
    const sa = await this.saService.findOne(dto.savings_account_id);
    if (!sa) throw new NotFoundException(`Savings account ${dto.savings_account_id} not found in branch`);


    const docType = await this.docTypeRepo.findOneBy({ id: dto.document_type_id });
    if (!docType) throw new NotFoundException(`Type de document ${dto.document_type_id} introuvable`);

    const requiredDocs = await this.saService.getRequiredDocuments(sa.id);
    const requiredIds = requiredDocs.map(d => d.id);
    if (!requiredIds.includes(Number(dto.document_type_id))) {
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
    entity.name = docType.name;
    entity.document_type = docType;
    entity.status = 0;
    entity.file_path = uploadedFile.fileName;
    entity.file_size = uploadedFile.fileSize;
    entity.savings_account = plainToInstance(SavingsAccount,sa);
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

  async findDocumentsByAccount(
    accountId: number,
    status?: number,
    page?: number,
    limit?: number
  ): Promise<PaginatedResult<DocumentSavingAccountResponseDto>> {
    // Vérifier que le compte existe
    const accountExists = await this.repo.manager.getRepository('savings_account').count({ where: { id: accountId } });
    if (!accountExists) {
      throw new NotFoundException(`Savings account with ID ${accountId} not found`);
    }

    const qb = this.repo.createQueryBuilder('doc')
      .leftJoinAndSelect('doc.document_type', 'document_type')
      .leftJoinAndSelect('doc.customer', 'customer')
      .where('doc.savings_account_id = :accountId', { accountId });

    // Filtrer par statut si fourni
    if (status != -1) {
      qb.andWhere('doc.status = :status', { status });
    }

    // Options de pagination
    const options = { page, limit };

    // Exécuter la pagination
    const paginatedResult = await this.paginationService.paginate<DocumentSavingAccount>(qb, options);

    // Transformer les résultats en DTO
    const data = paginatedResult.data.map(doc => 
      plainToInstance(DocumentSavingAccountResponseDto, doc, {
        excludeExtraneousValues: true,
      })
    );

    return {
      ...paginatedResult,
      data,
    };
  }

    async getDocumentStatusCounts(accountId: number): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  }> {
    const counts = await this.repo
      .createQueryBuilder('doc')
      .select('doc.status', 'status')
      .addSelect('COUNT(doc.id)', 'count')
      .where('doc.savings_account_id = :accountId', { accountId })
      .groupBy('doc.status')
      .getRawMany();

    const result = {
      pending: 0,
      approved: 0,
      rejected: 0,
      total: 0
    };

    counts.forEach(item => {
      result.total += parseInt(item.count);
      switch (item.status) {
        case 0: result.pending = parseInt(item.count); break;
        case 1: result.approved = parseInt(item.count); break;
        case 2: result.rejected = parseInt(item.count); break;
      }
    });

    return result;
  }
}
