// src/core-banking/providers/provider.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Provider } from './entities/provider.entity';

@ApiTags('providers')
@Controller('providers')
export class ProviderController {
  constructor(private readonly service: ProviderService) {}

  // Crée un provider
  @Post()
  @ApiOperation({ summary: 'Créer un nouveau provider' })
  @ApiResponse({ status: 201, description: 'Provider créé', type: Provider })
  create(@Body() dto: CreateProviderDto): Promise<Provider> {
    return this.service.create(dto);
  }

  // Liste les providers, filtrable par code pays
  @Get()
  @ApiOperation({ summary: 'Liste des providers avec filtre optionnel par pays' })
  @ApiResponse({ status: 200, description: 'Liste des providers', type: [Provider] })
  findAll(@Query('country') countryCode?: string): Promise<Provider[]> {
    return countryCode
      ? this.service.findByCountry(countryCode)
      : this.service.findAll();
  }

  // Récupère un provider par code
  @Get(':code')
  @ApiOperation({ summary: 'Récupérer un provider par son code' })
  @ApiResponse({ status: 200, description: 'Détails du provider', type: Provider })
  findOne(@Param('code') code: string): Promise<Provider> {
    return this.service.findOne(code);
  }

  // Met à jour un provider
  @Put(':code')
  @ApiOperation({ summary: 'Mettre à jour un provider existant' })
  @ApiResponse({ status: 200, description: 'Provider mis à jour', type: Provider })
  update(
    @Param('code') code: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<Provider> {
    return this.service.update(code, dto);
  }

  // Supprime un provider
  @Delete(':code')
  @ApiOperation({ summary: 'Supprimer un provider' })
  @ApiResponse({ status: 200, description: 'Provider supprimé', type: Provider })
  remove(@Param('code') code: string): Promise<Provider> {
    return this.service.remove(code);
  }
}