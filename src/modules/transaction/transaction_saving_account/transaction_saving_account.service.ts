// Service TransactionSavingsAccount - src/core-banking/providers/transaction-savings-account.service.ts
// Gère la logique métier des transactions épargne
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionSavingsAccount } from './entities/transaction_saving_account.entity';
import { CreateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { UpdateTransactionSavingsAccountDto } from './dto/update-transaction_saving_account.dto';

@Injectable()
export class TransactionSavingsAccountService {
  constructor(
    @InjectRepository(TransactionSavingsAccount)
    private readonly repo: Repository<TransactionSavingsAccount>,
  ) {}

  // Crée une nouvelle transaction épargne
  create(dto: CreateTransactionSavingsAccountDto): Promise<TransactionSavingsAccount> {
    const entity = this.repo.create(dto);
    entity.status = 1;
    return this.repo.save(entity);
  }

  // Liste toutes les transactions épargne
  findAll(): Promise<TransactionSavingsAccount[]> {
    return this.repo.find({
      relations: ['savingsAccount', 'channelsTransaction', 'provider', 'transactionType'],
    });
  }

  // Récupère une transaction par son ID
  async findOne(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['savingsAccount', 'channelsTransaction', 'provider', 'transactionType'],
    });
    if (!entity) throw new NotFoundException(`Transaction ${id} non trouvé`);
    return entity;
  }

  // Met à jour une transaction existante
  async update(id: number, dto: UpdateTransactionSavingsAccountDto): Promise<TransactionSavingsAccount> {
    await this.repo.update(id, dto as any);
    return this.findOne(id);
  }

  // Supprime une transaction
  async remove(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }
}