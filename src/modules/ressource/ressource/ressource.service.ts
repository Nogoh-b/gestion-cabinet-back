import { BaseService } from 'src/core/shared/services/search/base.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';





import { RessourceType } from '../ressource-type/entities/ressource-type.entity';
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
    item.status = 1
    const ressource = await this.repository.save(item);
    return  this.findOne(ressource.id)
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

    async getBySavingsAccountId(savings_account_id: number): Promise<Ressource[]> {
    return this.repository.find({
      where: { savings_account_id },
      relations: ['ressource_type'],
    });
  }

  async getByIdAndSavingsAccount(id: number, strict = true): Promise<Ressource | null> {
    const ressource = await this.repository.findOne({
      where: { id },
      relations: ['ressource_type'],
    });
    if (!ressource && strict) throw new NotFoundException('Ressource non trouvée pour ce compte');
    return ressource;
  }
  async getRessourceTypeById(id: number): Promise<RessourceType> {
    const ressource = await this.repository.findOne({
      where: { id },
      relations: ['ressource_type'],
    });
    if (!ressource) throw new NotFoundException('Ressource non trouvée');
    return ressource.ressource_type;
  }

}
