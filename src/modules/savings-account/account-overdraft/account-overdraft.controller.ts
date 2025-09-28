import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccountOverdraftService } from './account-overdraft.service';
import { CreateAccountOverdraftDto } from './dto/create-account-overdraft.dto';
import { UpdateAccountOverdraftDto } from './dto/update-account-overdraft.dto';
import { AccountOverdraft } from './entities/account-overdraft.entity';

@ApiTags('Account Overdrafts') // Swagger regroupe les endpoints
@Controller('account-overdrafts')
export class AccountOverdraftController {
  constructor(private readonly overdraftService: AccountOverdraftService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau plafond de découvert' })
  @ApiResponse({ status: 201, description: 'Plafond créé avec succès', type: AccountOverdraft })
  create(@Body() dto: CreateAccountOverdraftDto) {
    return this.overdraftService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les plafonds (historique complet)' })
  @ApiResponse({ status: 200, type: [AccountOverdraft] })
  findAll() {
    return this.overdraftService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un plafond spécifique' })
  @ApiResponse({ status: 200, type: AccountOverdraft })
  findOne(@Param('id') id: number) {
    return this.overdraftService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un plafond' })
  @ApiResponse({ status: 200, type: AccountOverdraft })
  update(@Param('id') id: number, @Body() dto: UpdateAccountOverdraftDto) {
    return this.overdraftService.update(id, dto);
  }

  /*@Delete(':id')
  @ApiOperation({ summary: 'Supprimer un plafond' })
  @ApiResponse({ status: 204, description: 'Plafond supprimé avec succès' })
  remove(@Param('id') id: number) {
    return this.overdraftService.remove(id);
  }*/

  @Get('history/:accountId')
  @ApiOperation({ summary: 'Récupérer l’historique des plafonds d’un compte' })
  @ApiResponse({ status: 200, type: [AccountOverdraft] })
  findHistory(@Param('accountId') accountId: number) {
    return this.overdraftService.findByAccount(accountId);
  }

  @Get('current/:accountId')
  @ApiOperation({ summary: 'Obtenir le plafond actif pour un compte' })
  @ApiResponse({ status: 200, description: 'Plafond actuel', type: Number })
  getCurrent(@Param('accountId') accountId: number) {
    return this.overdraftService.getCurrentOverdraft(accountId);
  }
}
