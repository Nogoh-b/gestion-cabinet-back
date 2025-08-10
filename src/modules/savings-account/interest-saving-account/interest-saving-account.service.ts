import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterestSavingAccount } from './entities/interest-saving-account.entity';
import { CreateInterestSavingAccountDto } from './dto/create-interest-saving-account.dto';
import { UpdateInterestSavingAccountDto } from './dto/update-interest-saving-account.dto';

@Injectable()
export class InterestSavingAccountService {
  constructor(
    @InjectRepository(InterestSavingAccount)
    private readonly repo: Repository<InterestSavingAccount>,
  ) {}

  async find_all(): Promise<InterestSavingAccount[]> {
    return this.repo.find();
  }

  async find_one(id: number): Promise<InterestSavingAccount> {
    const plan = await this.repo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Interest plan ${id} not found`);
    return plan;
  }

  async create(dto: CreateInterestSavingAccountDto): Promise<InterestSavingAccount> {
    const plan = this.repo.create({
      duration_months: dto.duration_months,
      rate: dto.rate,
    });
    return this.repo.save(plan);
  }

  async update(id: number, dto: UpdateInterestSavingAccountDto): Promise<InterestSavingAccount> {
    await this.repo.update(id, dto);
    return this.find_one(id);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Interest plan ${id} not found`);
  }
}
