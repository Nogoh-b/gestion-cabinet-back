import { plainToInstance } from 'class-transformer';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { generateEntityCode } from 'src/core/shared/utils/code.util';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { getCurrentTenantId, hasActiveTenant } from 'src/core/tenant/tenant.context';
import { ownCopyOf, preferOwnByCode } from 'src/core/tenant/shared-rows';

import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { DocumentCategoryResponseDto } from './dto/document-category-response.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { DocumentCategory } from './entities/document-category.entity';

@Injectable()
export class DocumentCategoryService extends BaseServiceV1<DocumentCategory> {
  constructor(
    @InjectRepository(DocumentCategory)
    private categoryRepository: Repository<DocumentCategory>,
    protected readonly paginationService: PaginationServiceV1,
  ) {
    super(categoryRepository, paginationService);
  }

  /** Champs de recherche / filtres pour le endpoint paginé /search */
  protected getDefaultSearchOptions() {
    return {
      searchFields: ['code', 'name', 'description'],
      exactMatchFields: ['id', 'is_active', 'is_system', 'sort_order'],
      dateRangeFields: ['created_at', 'updated_at'],
    };
  }

  async create(
    dto: CreateDocumentCategoryDto,
  ): Promise<DocumentCategoryResponseDto> {
    // Code facultatif : généré automatiquement s'il n'est pas fourni.
    if (!dto.code?.trim()) {
      dto.code = generateEntityCode('CAT', dto.name);
    }

    const existing = await this.categoryRepository.findOne({
      where: [{ code: dto.code }, { name: dto.name }],
    });

    if (existing) {
      throw new ConflictException(
        `Une catégorie avec ce code ou nom existe déjà`,
      );
    }

    const category = this.categoryRepository.create({
      ...dto,
      metadata: {
        retention_period: dto.retention_period,
        allowed_mime_types: dto.allowed_mime_types,
        max_file_size_mb: dto.max_file_size_mb,
        confidentiality_level: dto.confidentiality_level,
      },
    });

    const saved = await this.categoryRepository.save(category);
    return plainToInstance(DocumentCategoryResponseDto, saved);
  }

  async findAll(): Promise<DocumentCategoryResponseDto[]> {
    const categories = await this.categoryRepository.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', name: 'ASC' },
    });

    // Catégories partagées : le cabinet lit les globales (tenant 1) en plus
    // de ses copies ; une seule ligne par code, la sienne d'abord.
    return plainToInstance(DocumentCategoryResponseDto, preferOwnByCode(categories));
  }

  /** Recherche paginée sans les globales déjà copiées dans le cabinet. */
  async searchOwnFirst(
    criteria: SearchCriteria,
    paginationParams?: PaginationParamsDto,
  ) {
    const shadowed = await this.shadowedGlobalIds();
    const scope: FindOptionsWhere<DocumentCategory> | undefined =
      shadowed.length && criteria?.id === undefined
        ? { id: Not(In(shadowed)) }
        : undefined;
    return this.searchWithTransformer(
      criteria,
      DocumentCategoryResponseDto,
      paginationParams,
      undefined,
      undefined,
      scope,
    );
  }

  /** Ids des catégories globales qui ont une copie (même code) dans le cabinet. */
  private async shadowedGlobalIds(): Promise<number[]> {
    if (!hasActiveTenant()) return [];
    const tenantId = getCurrentTenantId();
    if (!tenantId || tenantId === 1) return [];
    const rows: Array<{ id: number }> = await this.categoryRepository.manager.query(
      `SELECT g.id FROM document_categories g
         JOIN document_categories o ON o.code = g.code AND o.tenant_id = ?
        WHERE g.tenant_id = 1`,
      [tenantId],
    );
    return rows.map((row) => Number(row.id));
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

  async update(
    id: number,
    dto: UpdateDocumentCategoryDto,
  ): Promise<DocumentCategoryResponseDto> {
    const found = await this.categoryRepository.findOne({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Catégorie avec l'ID ${id} introuvable`);
    }
    // Une catégorie globale se modifie dans la copie du cabinet : `save`
    // déplacerait sinon la ligne du référentiel dans le cabinet.
    const category = await ownCopyOf(
      found,
      (code) => this.categoryRepository.findOne({ where: { code } as any, order: { tenant_id: 'DESC' } as any }),
      (copy) => this.categoryRepository.create(copy),
    );

    Object.assign(category, dto);
    const updated = await this.categoryRepository.save(category);

    return plainToInstance(DocumentCategoryResponseDto, updated);
  }
}
