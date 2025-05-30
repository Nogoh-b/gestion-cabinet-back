

// src/savings-products/type-savings-account.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';
import { TypeSavingsAccount } from './entities/type-savings-account.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';

@Injectable()
export class TypeSavingsAccountService {
  constructor(
    @InjectRepository(TypeSavingsAccount)
    private readonly repo: Repository<TypeSavingsAccount>,
    @InjectRepository(DocumentType)
    private readonly docRepo: Repository<DocumentType>,
  ) {}

  /** Liste tous les produits d’épargne avec leurs documents requis */
  async findAll(): Promise<TypeSavingsAccount[]> {
    return this.repo.find({ relations: ['required_documents', 'interestRate'] });
  }

  /** Récupère un produit d’épargne par ID avec ses documents requis */
  async findOne(productId: number): Promise<TypeSavingsAccount> {
    const prod = await this.repo.findOne({
      where: { id: productId },
      relations: ['required_documents', 'interestRate'],
    });
    if (!prod) throw new NotFoundException(`Produit ${productId} introuvable`);
    return prod;
  }

  /** Liste des documents requis pour un produit */


  async create(dto: CreateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    // Validate document types
    const docs = await this.docRepo.findByIds(dto.documentTypeIds);
    if (dto.documentTypeIds && docs.length !==  dto.documentTypeIds.length)
      throw new NotFoundException('Un ou plusieurs documents introuvables');

    // Create the product with all fields
    const prod = this.repo.create({
      ...dto,
      required_documents: docs,
    });
    return this.repo.save(prod);
  }

  async update(id: number, dto: UpdateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    const prod = await this.repo.preload({ id, ...dto });
    if (!prod) throw new NotFoundException(`Produit ${id} introuvable`);

    if (dto.documentTypeIds) {
      const docs = await this.docRepo.find({ where: { id: In(dto.documentTypeIds) } });
      if (docs.length !== dto.documentTypeIds.length)
        throw new NotFoundException('Un ou plusieurs documents introuvables');
      prod.required_documents = docs;
    }

    return this.repo.save(prod);
  }
  async getRequiredDocuments(typeId: number): Promise<DocumentType[]> {
    const prod = await this.findOne(typeId);
    return prod.required_documents;
  }
}