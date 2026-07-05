import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { ExercicesService } from '../services/exercices.service';

@ApiTags('comptabilite-exercices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/exercices')
export class ExercicesController {
  constructor(private readonly service: ExercicesService) {}

  @Get()
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Liste tous les exercices comptables' })
  findAll() {
    return this.service.findAll();
  }

  @Get('ouvert')
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: "Retourne l'exercice actuellement ouvert" })
  findOuvert() {
    return this.service.findOuvert();
  }

  @Post()
  @RequirePermissions('open_exercice')
  @ApiOperation({ summary: 'Ouvrir un nouvel exercice pour une annee donnee' })
  create(@Body('annee') annee: number) {
    return this.service.create(annee);
  }

  @Patch(':id/cloturer')
  @RequirePermissions('close_exercice')
  @ApiOperation({ summary: 'Cloturer un exercice' })
  cloturer(@Param('id', ParseIntPipe) id: number) {
    return this.service.cloturer(id);
  }
}
