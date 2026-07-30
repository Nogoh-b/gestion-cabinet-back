import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { ComptesService } from '../services/comptes.service';
import { CompteComptable } from '../entities/compte.entity';
import { ClasseCompte } from '../enums/comptabilite.enums';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CreateCompteDto } from '../dto/create-compte.dto';

@ApiTags('comptabilite-comptes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/comptes')
export class ComptesController {
  constructor(private readonly service: ComptesService) {}

  @Get()
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Liste tous les comptes du plan comptable' })
  findAll(@Query('classe') classe?: number) {
    if (classe) return this.service.findByClasse(Number(classe) as ClasseCompte);
    return this.service.findAll();
  }

  @Get('soldes')
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Soldes de tous les comptes (pour balance)' })
  getSoldes() {
    return this.service.getSoldes();
  }

  @Post()
  @RequirePermissions('manage_chart_of_accounts')
  @ApiOperation({ summary: 'Créer un compte comptable' })
  create(@Body() data: CreateCompteDto) {
    return this.service.create(data);
  }
}
