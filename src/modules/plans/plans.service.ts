import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService extends BaseServiceV1<Plan> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Plan)
    protected repository: Repository<Plan>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const plan = this.repository.create(dto);
    return this.repository.save(plan);
  }

  async findAll(): Promise<Plan[]> {
    return this.repository.find({ order: { name: 'ASC' } });
  }

  async findActive(): Promise<Plan[]> {
    return this.repository.find({ where: { is_active: true }, order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Plan> {
    const plan = await this.repository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan #${id} non trouvé`);
    return plan;
  }

  async update(id: number, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findOne(id);
    Object.assign(plan, dto);
    return this.repository.save(plan);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id); // vérifie l'existence
    await this.repository.delete(id);
  }
}
