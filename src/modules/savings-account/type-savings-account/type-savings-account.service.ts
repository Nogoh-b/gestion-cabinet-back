

// src/savings-products/type-savings-account.service.ts
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { In, Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';



import { CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';
import { TypeSavingsAccount } from './entities/type-savings-account.entity';




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
    return this.repo.find({
      where: { status: 1 },
      relations: ['required_documents', 'interestRate'],
    });
  }

  async findAllOnline(): Promise<TypeSavingsAccount[]> {
    return this.repo.find({
      where: { status: 1, canCreateOnline : 1 },
      relations: ['required_documents', 'interestRate'],
    });
  }

  /** Récupère un produit d’épargne par ID avec ses documents requis */
  async findOne(productId: number): Promise<TypeSavingsAccount> {
    const prod = await this.repo.findOne({
      where: { id: productId, status: 1 },
      relations: ['required_documents', 'interestRate'],
    });
    if (!prod) throw new NotFoundException(`Produit ${productId} introuvable`);
    return prod;
  }

  /** Liste des documents requis pour un produit */

  async create(dto: CreateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    // Validate document types
    const docs = await this.docRepo.findByIds(dto.documentTypeIds);
    if (dto.documentTypeIds && docs.length !== dto.documentTypeIds.length)
      throw new NotFoundException('Un ou plusieurs documents introuvables');
    dto.periode = '0'
    // Create the product with all fields
    const prod = this.repo.create({
      ...dto,
      initial_deposit : this.calculerSoldeMinimumDepot(dto),
      required_documents: docs,
    });
    return this.repo.save(prod);
  }

  async update(
    id: number,
    dto: UpdateTypeSavingsAccountDto,
  ): Promise<TypeSavingsAccount> {
    const prod = await this.repo.preload({ id, ...dto });
    if (!prod) throw new NotFoundException(`Produit ${id} introuvable`);

    if (dto.documentTypeIds) {
      const docs = await this.docRepo.find({
        where: { id: In(dto.documentTypeIds) },
      });
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

  async remove(id: number): Promise<any> {
    const type_account = await this.repo.findOne({
      where: { id },
    });
    type_account!.status = 0;
    return await type_account?.save();
  }

  async activate(id: number): Promise<any> {
    const type_account = await this.repo.findOne({
      where: { id },
    });
    type_account!.status = 1;
    return await type_account?.save();
  }

  calculerSoldeMinimumDepot(produit) {
    // 1. Calcul du montant bloqué (si durée de blocage > 0)
    const montantBloque = (produit.minimum_blocking_duration > 0) 
        ?  0.0
        : 0.0;

    // 2. Calcul des frais récurrents (minimum balance + frais mensuels)
    const fraisRecurrents = (parseFloat(produit.minimum_balance) || 0.0) + 
                           (parseFloat(produit.monthly_maintenance_costs) || 0.0);

    // 3. Ajout des frais uniques (frais d'ouverture)
    const fraisUniques = parseFloat(produit.account_opening_fee) || 0.0;

    // 4. Calcul du total avec précision décimale
    const total = parseFloat(
        (montantBloque + fraisRecurrents + fraisUniques).toFixed(2)
    );

    // 5. Retourne le montant arrondi (toujours >= 0)
    return Math.max(total, 0.0);
  }
}