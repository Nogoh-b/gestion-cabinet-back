// src/commercial/commercial.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Commercial } from './entities/commercial.entity';
import { CreateCommercialDto } from './dto/create-commercial.dto';
import { BaseService } from 'src/core/shared/services/search/base.service';

@Injectable()
export class CommercialService extends BaseService<Commercial> {
  constructor(
    @InjectRepository(Commercial)
    private readonly commercialRepository: Repository<Commercial>,
  ) {
    super();
  }

  getRepository(): Repository<Commercial> {
    return this.commercialRepository;
  }

  /**
   * Crée un nouveau commercial
   */
  async createCommercial(dto: CreateCommercialDto): Promise<Commercial> {
    const commercial = this.commercialRepository.create(dto);
    return this.commercialRepository.save(commercial);
  }

  /**
   * Récupère tous les commerciaux
   */
  async getAll(): Promise<Commercial[]> {
    return this.commercialRepository.find();
  }

  /**
   * Récupère un commercial par son ID
   */
  async getById(id: number): Promise<Commercial> {
    const commercial = await this.commercialRepository.findOne({where: { id }});
    if (!commercial) {
      throw new NotFoundException(`Commercial ${id} introuvable`);
    }
    return commercial;
  }
}
