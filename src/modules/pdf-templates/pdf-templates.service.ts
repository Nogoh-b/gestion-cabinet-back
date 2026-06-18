import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { PdfTemplate } from './entities/pdf-template.entity';
import { CreatePdfTemplateDto } from './dto/create-pdf-template.dto';
import { UpdatePdfTemplateDto } from './dto/update-pdf-template.dto';

@Injectable()
export class PdfTemplatesService extends BaseServiceV1<PdfTemplate> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(PdfTemplate)
    protected repository: Repository<PdfTemplate>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreatePdfTemplateDto): Promise<PdfTemplate> {
    const tpl = this.repository.create(dto as any);
    return this.repository.save(tpl as any);
  }

  async findAll(): Promise<PdfTemplate[]> {
    return this.repository.find({ order: { entity_type: 'ASC', name: 'ASC' } });
  }

  async findActive(): Promise<PdfTemplate[]> {
    return this.repository.find({
      where: { is_active: true },
      order: { entity_type: 'ASC', name: 'ASC' },
    });
  }

  /** Modèles actifs d'un type d'entité donné (ex. toutes les variantes de facture). */
  async findByEntity(entityType: string): Promise<PdfTemplate[]> {
    return this.repository.find({
      where: { entity_type: entityType, is_active: true },
      order: { variant: 'ASC', name: 'ASC' },
    });
  }

  async findByCode(code: string): Promise<PdfTemplate | null> {
    return this.repository.findOne({ where: { code } });
  }

  async findOne(id: number): Promise<PdfTemplate> {
    const tpl = await this.repository.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException(`Modèle PDF #${id} non trouvé`);
    return tpl;
  }

  async update(id: number, dto: UpdatePdfTemplateDto): Promise<PdfTemplate> {
    const tpl = await this.findOne(id);
    // Le code des modèles système ne peut pas changer.
    if (tpl.is_system && dto.code && dto.code !== tpl.code) {
      delete (dto as any).code;
    }
    Object.assign(tpl, dto);
    return this.repository.save(tpl);
  }

  async remove(id: number): Promise<void> {
    const tpl = await this.findOne(id);
    if (tpl.is_system) {
      // On désactive plutôt que de supprimer un modèle système.
      tpl.is_active = false;
      await this.repository.save(tpl);
      return;
    }
    await this.repository.delete(id);
  }
}
