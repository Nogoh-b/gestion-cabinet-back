// src/core/document/document-type.service.ts
import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { In, Repository } from 'typeorm';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';


import { InjectRepository } from '@nestjs/typeorm';


import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentTypeResponseDto } from './dto/ressponse-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentType } from './entities/document-type.entity';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';





@Injectable()
export class DocumentTypeService  extends BaseServiceV1<DocumentType>{
  constructor(
      protected readonly paginationService: PaginationServiceV1,
        @InjectRepository(DocumentType)
    protected repository: Repository<DocumentType>,
      @InjectRepository(DocumentCategory)
    private readonly categoryRepository: Repository<DocumentCategory>,
  ) {    
    super(repository, paginationService);}

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['code', 'name', 'description'],
      exactMatchFields: ['status'],
      dateRangeFields: [ 'created_at'],
      relationFields: ['documents','categories'],
    };
  }

    /**
   * Génère un code unique pour le document type
   * Format: DOC_XXXXXX (ex: DOC_000001, DOC_000002)
   */
  private async generateUniqueCode(): Promise<string> {
    // Compter le nombre de documents existants
    const count = await this.repository.count();
    
    // Format: DOC_ + numéro à 6 chiffres
    const sequentialNumber = (count + 1).toString().padStart(6, '0');
    const code = `DOC_${sequentialNumber}`;
    
    // Vérifier si le code existe déjà (par sécurité)
    const existing = await this.repository.findOne({
      where: { code }
    });
    
    if (existing) {
      // En cas de collision, récursion
      return this.generateUniqueCode();
    }
    
    return code;
  }


 async create(createDto: CreateDocumentTypeDto): Promise<DocumentType> {
    const { categoryIds, ...rest } = createDto;

        // Générer le code automatiquement si non fourni
    let code = rest.code;
    if (!code) {
      // Option 1: Code séquentiel simple
      code = await this.generateUniqueCode();
      
      // Option 2: Code basé sur le nom (décommentez pour utiliser)
      // code = this.generateCodeFromName(rest.name);
    } else {
      // Vérifier si le code fourni n'existe pas déjà
      const existing = await this.repository.findOne({
        where: { code }
      });
      
      if (existing) {
        throw new ConflictException(`Le code "${code}" existe déjà`);
      }
    }
    
    // Créer l'entité avec les données de base
    const documentType = this.repository.create({
      ...rest,
      code,
    });
    
    // Sauvegarder d'abord pour obtenir un ID
    await this.repository.save(documentType);
    
    // Si des catégories sont spécifiées, les associer
    if (categoryIds && categoryIds.length > 0) {
      const categories = await this.categoryRepository.findBy({
        id: In(categoryIds)
      });
      
      if (categories.length !== categoryIds.length) {
        throw new NotFoundException('Une ou plusieurs catégories non trouvées');
      }
      
      documentType.categories = categories;
      return this.repository.save(documentType);
    }
    
    return documentType;
  }

  async update(id: number, updateDto: UpdateDocumentTypeDto): Promise<DocumentType> {
    const { categoryIds, ...rest } = updateDto;
    
    // Vérifier si l'entité existe
    const existing = await this.repository.findOne({
      where: { id },
      relations: ['categories']
    });
    
    if (!existing) {
      throw new NotFoundException(`DocumentType avec ID ${id} non trouvé`);
    }
    
    // Mettre à jour les champs simples
    Object.assign(existing, rest);
    
    // Mettre à jour les catégories si spécifiées
    if (categoryIds !== undefined) {
      if (categoryIds.length === 0) {
        // Supprimer toutes les liaisons
        existing.categories = [];
      } else {
        // Remplacer les catégories
        const categories = await this.categoryRepository.findBy({
          id: In(categoryIds)
        });
        
        if (categories.length !== categoryIds.length) {
          throw new NotFoundException('Une ou plusieurs catégories non trouvées');
        }
        
        existing.categories = categories;
      }
    }
    
    return this.repository.save(existing);
  }

  // Ajouter une catégorie à un document type
  async addCategory(documentTypeId: number, categoryId: number): Promise<DocumentType> {
    const documentType = await this.repository.findOne({
      where: { id: documentTypeId },
      relations: ['categories']
    });
    
    if (!documentType) {
      throw new NotFoundException(`DocumentType avec ID ${documentTypeId} non trouvé`);
    }
    
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId }
    });
    
    if (!category) {
      throw new NotFoundException(`Catégorie avec ID ${categoryId} non trouvée`);
    }
    
    // Vérifier si la catégorie n'est pas déjà associée
    const alreadyExists = documentType.categories.some(cat => cat.id === categoryId);
    
    if (!alreadyExists) {
      documentType.categories.push(category);
      await this.repository.save(documentType);
    }
    
    return documentType;
  }

  // Retirer une catégorie d'un document type
  async removeCategory(documentTypeId: number, categoryId: number): Promise<DocumentType> {
    const documentType = await this.repository.findOne({
      where: { id: documentTypeId },
      relations: ['categories']
    });
    
    if (!documentType) {
      throw new NotFoundException(`DocumentType avec ID ${documentTypeId} non trouvé`);
    }
    
    documentType.categories = documentType.categories.filter(cat => cat.id !== categoryId);
    
    return this.repository.save(documentType);
  }



  async findAll(): Promise<DocumentType[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<DocumentTypeResponseDto> {
    const document_type = await this.repository.findOne({where : { id }});
    if (!document_type) {
      throw new NotFoundException(`DocumentType with ID ${id} not found`);
    }
    return plainToInstance(DocumentTypeResponseDto,document_type);
  }



  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }


    /**
   * Récupère tous les types de documents d'une catégorie spécifique
   * @param categoryId - L'ID de la catégorie
   * @returns Liste des types de documents
   */
  async getAllByCategory(categoryId: number): Promise<DocumentType[]> {
    // Vérifier si la catégorie existe
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId }
    });

    if (!category) {
      throw new NotFoundException(`Catégorie avec l'ID ${categoryId} non trouvée`);
    }

    // Version 1: Avec relation Many-to-Many
    const documentTypes = await this.repository
      .createQueryBuilder('document_type')
      .leftJoinAndSelect('document_type.categories', 'category')
      .where('category.id = :categoryId', { categoryId })
      .getMany();

    // Version 2: Avec relation Many-to-One (si une seule catégorie par document)
    // const documentTypes = await this.documentTypeRepository.find({
    //   where: { documentCategoryId: categoryId },
    //   relations: ['category']
    // });

    return documentTypes;
  }
}