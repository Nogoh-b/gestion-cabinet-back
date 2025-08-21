// Controller ActivitiesSavingsAccount - src/core-banking/providers/activities-savings-account.controller.ts
// Définit les routes HTTP pour les activités de compte d’épargne
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ActivitiesSavingsAccountService } from './activities-savings-account.service';
import { ActivitiesSavingsAccount } from './entities/activities-savings-account.entity';
import { CreateActivitiesSavingsAccountDto } from './dto/create-activities-savings-account.dto';
import { UpdateActivitiesSavingsAccountDto } from './dto/update-activities-savings-account.dto';

@ApiTags('activities-savings-accounts')
@Controller('activities-savings-accounts')
export class ActivitiesSavingsAccountController {
  constructor(private readonly service: ActivitiesSavingsAccountService) {}

  // Crée une activité
  @Post()
  @ApiOperation({ summary: 'Créer une activité de compte épargne' })
  @ApiResponse({ status: 201, description: 'Activité créée', type: ActivitiesSavingsAccount })
  create(@Body() dto: CreateActivitiesSavingsAccountDto): Promise<ActivitiesSavingsAccount> {
    return this.service.create(dto);
  }

  // Liste toutes les activités
  @Get()
  @ApiOperation({ summary: 'Lister les activités de compte épargne' })
  @ApiResponse({ status: 200, description: 'Liste des activités', type: [ActivitiesSavingsAccount] })
  findAll(): Promise<ActivitiesSavingsAccount[]> {
    return this.service.findAll();
  }

  // Récupère une activité par ID
  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une activité par ID' })
  @ApiResponse({ status: 200, description: 'Détails de l’activité', type: ActivitiesSavingsAccount })
  findOne(@Param('id') id: number): Promise<ActivitiesSavingsAccount> {
    return this.service.findOne(+id);
  }

  // Met à jour une activité
  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une activité' })
  @ApiResponse({ status: 200, description: 'Activité mise à jour', type: ActivitiesSavingsAccount })
  update(
    @Param('id') id: number,
    @Body() dto: UpdateActivitiesSavingsAccountDto,
  ): Promise<ActivitiesSavingsAccount> {
    return this.service.update(+id, dto);
  }

  // Supprime une activité
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une activité' })
  @ApiResponse({ status: 200, description: 'Activité supprimée', type: ActivitiesSavingsAccount })
  remove(@Param('id') id: number): Promise<ActivitiesSavingsAccount> {
    return this.service.remove(+id);
  }
}