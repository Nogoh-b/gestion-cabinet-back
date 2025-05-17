import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSavingAccount } from './entities/document-saving-account.entity';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { SavingsAccount } from '../savings-account/entities/savings-account.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';

@Injectable()
export class DocumentSavingAccountService {
  constructor(
    @InjectRepository(DocumentSavingAccount)
    private readonly docRepo: Repository<DocumentSavingAccount>,
    @InjectRepository(DocumentType)
    private readonly typeRepo: Repository<DocumentType>,
    @InjectRepository(SavingsAccount)
    private readonly accountRepo: Repository<SavingsAccount>,
  ) {}

  /**
   * Soumettre un document pour vérification
   */
  async submit(
    dto: CreateDocumentSavingAccountDto,
  ): Promise<DocumentSavingAccount> {
    // Récupérer le compte épargne du client
    const account = await this.accountRepo.findOne({
      where: { id: dto.customer_id },
      relations: ['type_savings_account', 'type_savings_account.documentTypes', 'documents'],
    });
    if (!account) throw new NotFoundException('Compte épargne non trouvé');

    // Vérifier que le type de document est requis
    await this.ensureDocumentTypeRequired(
      account.accountType.id,
      dto.document_type_id,
    );

    // Vérifier qu'il n'est pas déjà soumis ou traité
    this.ensureNotAlreadyProcessed(
      account.documents,
      dto.document_type_id,
    );

    // Upload et récupération du lien
    let file: any  = '';
    let file_name: string  = '';

    const docType = await this.typeRepo.findOneBy({ id: dto.document_type_id });
    if (file) {

    }
    if (!file) {
      throw new BadRequestException('Aucun fichier uploadé');
    }
    const entity = this.docRepo.create({
      status: 0, // pending
    });
    return this.docRepo.save(entity);
  }

  /**
   * Valider ou rejeter un document
   */
  async review(id: number, approve: boolean): Promise<DocumentSavingAccount> {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document non trouvé');
    if (doc.status !== 0) {
      throw new BadRequestException('Document déjà traité');
    }
    doc.status = approve ? 1 : 2;
    if (approve) doc.date_validation = new Date();
    else doc.date_ejected = new Date();
    return this.docRepo.save(doc);
  }

  private async ensureDocumentTypeRequired(
    typeAccountId: number,
    documentTypeId: number,
  ) {
    const type = await this.typeRepo.findOne({
      where: { id: typeAccountId },
      relations: ['documentTypes'],
    });
    if (!type) throw new NotFoundException('Type de compte non trouvé');

  }

  private ensureNotAlreadyProcessed(
    documents: DocumentSavingAccount[],
    documentTypeId: number,
  ) {


  }
}

