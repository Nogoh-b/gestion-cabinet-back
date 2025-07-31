import { BaseService } from 'src/core/shared/services/search/base.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { CreateRessourceDto } from './dto/create-ressource.dto';
import { Ressource } from './entities/ressource.entity';

@Injectable()
export class RessourceService extends BaseService<Ressource> {
  constructor(
    @InjectRepository(Ressource)
    private readonly repository: Repository<Ressource>,
  ) {
    super();
  }

  getRepository(): Repository<Ressource> {
    return this.repository;
  }

  async create(data: CreateRessourceDto): Promise<Ressource> {
    const item = this.repository.create(data);
    return await this.repository.save(item);
  }

  async findAll(): Promise<Ressource[]> {
    return await this.repository.find({ relations: ['ressource_type', 'savings_account'] });
  }

  async findOne(id: number): Promise<Ressource> {
    const item = await this.repository.findOne({ where: { id }, relations: ['ressource_type', 'savings_account'] });
    if (!item) throw new NotFoundException('Ressource non trouvée');
    return item;
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }
}
