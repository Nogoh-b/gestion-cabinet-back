import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CreateAccountOverdraftDto } from './dto/create-account-overdraft.dto';
import { UpdateAccountOverdraftDto } from './dto/update-account-overdraft.dto';
import { AccountOverdraft } from './entities/account-overdraft.entity';

@Injectable()
export class AccountOverdraftService {
  constructor(
    @InjectRepository(AccountOverdraft)
    private readonly overdraftRepo: Repository<AccountOverdraft>,
  ) {}

  async create(dto: CreateAccountOverdraftDto): Promise<AccountOverdraft> {
    // Fermer l’ancien plafond actif (si existe)
    const current = await this.overdraftRepo.findOne({
      where: { account_id: dto.account_id, valid_to: IsNull() },
    });
    if (current) {
      current.valid_to = new Date();
      await this.overdraftRepo.save(current);
    }

    const overdraft = this.overdraftRepo.create(dto);
    return this.overdraftRepo.save(overdraft);
  }

  async findAll(): Promise<AccountOverdraft[]> {
    return this.overdraftRepo.find();
  }

  async findOne(id: number): Promise<AccountOverdraft> {
    const overdraft = await this.overdraftRepo.findOne({ where: { id } });
    if (!overdraft) throw new NotFoundException('Plafond non trouvé');
    return overdraft;
  }
  async findByAccount(accountId: number): Promise<AccountOverdraft[]> {
    return this.overdraftRepo.find({
      where: { account_id: accountId },
      order: { created_at: 'DESC' },
    });
  }

  async update(id: number, dto: UpdateAccountOverdraftDto): Promise<AccountOverdraft> {
    const overdraft = await this.findOne(id);
    Object.assign(overdraft, dto);
    return this.overdraftRepo.save(overdraft);
  }

  /*async remove(id: number): Promise<void> {
    const overdraft = await this.findOne(id);
    await this.overdraftRepo.remove(overdraft);
  }*/

  async getCurrentOverdraft(accountId: number): Promise<number> {
    const current = await this.overdraftRepo.findOne({
      where: { account_id: accountId, valid_to: IsNull() },
      order: { created_at: 'DESC' },
    });
    console.log(' overdraft_limit ', current ? current.overdraft_limit : 0)
    return current ? current.overdraft_limit : 0;
  }

  async canWithdraw(accountId: number, currentBalance: number, amount: number): Promise<boolean> {
    const limit = await this.getCurrentOverdraft(accountId);
    const newBalance = currentBalance - amount;
    return newBalance >= limit;
  }
}
