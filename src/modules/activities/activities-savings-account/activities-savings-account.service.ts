// Service ActivitiesSavingsAccount - src/core-banking/providers/activities-savings-account.service.ts
// Gère la logique métier des activités de compte d’épargne
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivitiesSavingsAccount } from './entities/activities-savings-account.entity';
import { CreateActivitiesSavingsAccountDto } from './dto/create-activities-savings-account.dto';
import { UpdateActivitiesSavingsAccountDto } from './dto/update-activities-savings-account.dto';

@Injectable()
export class ActivitiesSavingsAccountService {
  constructor(
    @InjectRepository(ActivitiesSavingsAccount)
    private readonly repo: Repository<ActivitiesSavingsAccount>,
  ) {}

  // Crée une nouvelle activité
  create(dto: CreateActivitiesSavingsAccountDto): Promise<ActivitiesSavingsAccount> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  // Récupère toutes les activités
  findAll(): Promise<ActivitiesSavingsAccount[]> {
    return this.repo.find({ relations: ['savingsAccount', 'user'] });
  }

  // Récupère une activité par ID
  async findOne(id: number): Promise<ActivitiesSavingsAccount> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['savingsAccount', 'user'],
    });
    if (!entity) throw new NotFoundException(`Activité ${id} non trouvée`);
    return entity;
  }

  // Met à jour une activité existante
  async update(id: number, dto: UpdateActivitiesSavingsAccountDto): Promise<ActivitiesSavingsAccount> {
    await this.repo.update(id, dto as any);
    return this.findOne(id);
  }

  // Supprime une activité
  async remove(id: number): Promise<ActivitiesSavingsAccount> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }
}