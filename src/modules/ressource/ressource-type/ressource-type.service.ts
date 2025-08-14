import { BaseService } from 'src/core/shared/services/search/base.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { CreateRessourceTypeDto } from './dto/create-ressource-type.dto';
import { UpdateRessourceTypeDto } from './dto/update-ressource-type.dto';
import { RessourceType } from './entities/ressource-type.entity';


@Injectable()
export class RessourceTypeService extends BaseService<RessourceType> {
  constructor(
    @InjectRepository(RessourceType)
    private readonly repository: Repository<RessourceType>,
  ) {
    super();
  }

  getRepository(): Repository<RessourceType> {
    return this.repository;
  }

  async create(data: CreateRessourceTypeDto): Promise<RessourceType> {
    const item = this.repository.create(data);
    return await this.repository.save(item);
  }

  async findAll(): Promise<RessourceType[]> {
    return await this.repository.find();
  }

  async findOne(id: number): Promise<RessourceType> {
    const item = await this.repository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('resource_type non trouvé');
    return item;
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }

  async update(id: number, dto: UpdateRessourceTypeDto): Promise<RessourceType> {
    // 1. Charge l’entité existante
    const ressource_type = await this.repository.findOne({ where: { id } });
    if (!ressource_type) {
      throw new NotFoundException(`Compte épargne #${id} introuvable`);
    }

    Object.assign(ressource_type, dto);

    return this.repository.save(ressource_type);
  }
}
