import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypePersonnel } from './entities/type_personnel.entity';
import { CreateTypePersonnelDto } from './dto/create-type_personnel.dto';
import { UpdateTypePersonnelDto } from './dto/update-type_personnel.dto';
import { BaseService } from 'src/core/shared/services/search/base.service';

@Injectable()
export class TypePersonnelService extends BaseService<TypePersonnel> {
  constructor(
    @InjectRepository(TypePersonnel)
    private readonly type_personnel_repository: Repository<TypePersonnel>,
  ) {
    super();
  }

  getRepository(): Repository<TypePersonnel> {
    return this.type_personnel_repository;
  }

  async create(dto: CreateTypePersonnelDto): Promise<TypePersonnel> {
    const entity = this.type_personnel_repository.create(dto);
    return this.type_personnel_repository.save(entity);
  }

  async findAll(): Promise<TypePersonnel[]> {
    return this.type_personnel_repository.find();
  }

  async findOne(id: number): Promise<TypePersonnel> {
    const entity = await this.type_personnel_repository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('TypePersonnel not found');
    return entity;
  }

  async update(id: number, dto: UpdateTypePersonnelDto): Promise<TypePersonnel> {
    const entity = await this.findOne(id);
    const merged = this.type_personnel_repository.merge(entity, dto);
    return this.type_personnel_repository.save(merged);
  }

  async remove(id: number): Promise<void> {
    const entity = await this.findOne(id);
    await this.type_personnel_repository.remove(entity);
  }
}
