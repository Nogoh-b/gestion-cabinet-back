import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { ComptesService } from '../services/comptes.service';
import { CompteComptable } from '../entities/compte.entity';
import { ClasseCompte } from '../enums/comptabilite.enums';

@ApiTags('comptabilite-comptes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comptabilite/comptes')
export class ComptesController {
  constructor(private readonly service: ComptesService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les comptes du plan comptable' })
  findAll(@Query('classe') classe?: number) {
    if (classe) return this.service.findByClasse(Number(classe) as ClasseCompte);
    return this.service.findAll();
  }

  @Get('soldes')
  @ApiOperation({ summary: 'Soldes de tous les comptes (pour balance)' })
  getSoldes() {
    return this.service.getSoldes();
  }

  @Post()
  @ApiOperation({ summary: 'Créer un compte comptable' })
  create(@Body() data: Partial<CompteComptable>) {
    return this.service.create(data);
  }
}
