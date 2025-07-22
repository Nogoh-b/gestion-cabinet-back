// Controller TransactionType - src/core-banking/providers/transaction-type.controller.ts
// Définition des routes HTTP pour les types de transaction
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TransactionTypeService } from './transaction_type.service';
import { TransactionType } from './entities/transaction_type.entity';
import { CreateTransactionTypeDto } from './dto/create-transaction_type.dto';
import { UpdateTransactionTypeDto } from './dto/update-transaction_type.dto';

@ApiTags('transaction-types')
@Controller('transaction-types')
export class TransactionTypeController {
  constructor(private readonly service: TransactionTypeService) {}

  // Crée un type de transaction
  @Post()
  @ApiOperation({ summary: 'Créer un type de transaction' })
  @ApiResponse({ status: 201, description: 'Type créé', type: TransactionType })
  create(@Body() dto: CreateTransactionTypeDto): Promise<TransactionType> {
    return this.service.create(dto);
  }

  // Liste tous les types de transaction
  @Get()
  @ApiOperation({ summary: 'Lister tous les types' })
  @ApiResponse({ status: 200, description: 'Liste des types', type: [TransactionType] })
  findAll(): Promise<TransactionType[]> {
    return this.service.findAll();
  }

  // Récupère un type par ID
  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type par ID' })
  @ApiResponse({ status: 200, description: 'Détails du type', type: TransactionType })
  findOne(@Param('id') id: number): Promise<TransactionType> {
    return this.service.findOne(+id);
  }

  // Met à jour un type existant
  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un type existant' })
  @ApiResponse({ status: 200, description: 'Type mis à jour', type: TransactionType })
  update(@Param('id') id: number, @Body() dto: UpdateTransactionTypeDto): Promise<TransactionType> {
    return this.service.update(+id, dto);
  }

  // Supprime un type de transaction
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type' })
  @ApiResponse({ status: 200, description: 'Type supprimé', type: TransactionType })
  remove(@Param('id') id: number): Promise<TransactionType> {
    return this.service.remove(+id);
  }
}