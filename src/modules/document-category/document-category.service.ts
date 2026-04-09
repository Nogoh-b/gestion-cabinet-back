import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';



import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { DocumentCategoryResponseDto } from './dto/document-category-response.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { DocumentCategory } from './entities/document-category.entity';




@Injectable()
export class DocumentCategoryService extends BaseServiceV1<DocumentCategory> {
  constructor(
    @InjectRepository(DocumentCategory)
    private categoryRepository: Repository<DocumentCategory>,
    protected readonly paginationService: PaginationServiceV1
  ) {
    super(categoryRepository, paginationService);
  }

  async create(dto: CreateDocumentCategoryDto): Promise<DocumentCategoryResponseDto> {
    const existing = await this.categoryRepository.findOne({
      where: [{ code: dto.code }, { name: dto.name }]
    });
    
    if (existing) {
      throw new ConflictException(`Une catégorie avec ce code ou nom existe déjà`);
    }

    const category = this.categoryRepository.create({
      ...dto,
      metadata: {
        retention_period: dto.retention_period,
        allowed_mime_types: dto.allowed_mime_types,
        max_file_size_mb: dto.max_file_size_mb,
        confidentiality_level: dto.confidentiality_level
      }
    });
    
    const saved = await this.categoryRepository.save(category);
    return plainToInstance(DocumentCategoryResponseDto, saved);
  }

  async findAll(): Promise<DocumentCategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', name: 'ASC' }
    });
    
    return plainToInstance(DocumentCategoryResponseDto, categories);
  }

  async findOne(id: number): Promise<DocumentCategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      // relations: ['document_types']
    });

    if (!category) {
      throw new NotFoundException(`Catégorie avec l'ID ${id} introuvable`);
    }

    return plainToInstance(DocumentCategoryResponseDto, category);
  }

  async update(id: number, dto: UpdateDocumentCategoryDto): Promise<DocumentCategoryResponseDto> {
    const category = await this.findOne(id);
    
    Object.assign(category, dto);
    const updated = await this.categoryRepository.save(category);
    
    return plainToInstance(DocumentCategoryResponseDto, updated);
  }
}