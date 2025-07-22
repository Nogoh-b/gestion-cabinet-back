// Service TransactionType - src/core-banking/providers/transaction-type.service.ts
// Gère la logique métier des types de transaction
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { CreateTransactionTypeDto } from './dto/create-transaction_type.dto';
import { UpdateTransactionTypeDto } from './dto/update-transaction_type.dto';
import { TransactionType } from './entities/transaction_type.entity';


@Injectable()
export class TransactionTypeService {
  constructor(
    @InjectRepository(TransactionType)
    private readonly repo: Repository<TransactionType>,
  ) {}

  // Crée un nouveau type de transaction
  create(dto: CreateTransactionTypeDto): Promise<TransactionType> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  // Récupère tous les types de transaction
  findAll(): Promise<TransactionType[]> {
    return this.repo.find();
  }

  // Récupère un type par son identifiant
  async findOne(id: number): Promise<TransactionType> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`TransactionType ${id} non trouvé`);
    return entity;
  }

  async findOneByCode(code: string): Promise<TransactionType> {
    const entity = await this.repo.findOne({ where: { code } });
    if (!entity) throw new NotFoundException(`TransactionType ${code} non trouvé`);
    return entity;
  }
  // Met à jour un type existant
  async update(id: number, dto: UpdateTransactionTypeDto): Promise<TransactionType> {
    await this.repo.update(id, dto as any);
    return this.findOne(id);
  }

  // Supprime un type de transaction
  async remove(id: number): Promise<TransactionType> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }
}