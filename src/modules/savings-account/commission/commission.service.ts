import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { Commission } from './entities/commission.entity';

@Injectable()
export class CommissionService {
  constructor(
    @InjectRepository(Commission)
    private readonly repo: Repository<Commission>,
  ) {}

  findAll(): Promise<Commission[]> {
    return this.repo.find();
  }

  async findOne(id: number): Promise<Commission> {
    const commission = await this.repo.findOne({ where: { id } });
    if (!commission) throw new NotFoundException(`Commission ${id} not found`);
    return commission;
  }

  create(dto: CreateCommissionDto): Promise<Commission> {
    const commission = this.repo.create({
      description: dto.description,
      value_type: dto.valueType,
      amount: dto.amount ?? null,
    });
    return this.repo.save(commission);
  }

  async update(id: number, dto: UpdateCommissionDto): Promise<Commission> {
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
