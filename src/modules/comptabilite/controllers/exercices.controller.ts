import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { ExercicesService } from '../services/exercices.service';

@ApiTags('comptabilite-exercices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comptabilite/exercices')
export class ExercicesController {
  constructor(private readonly service: ExercicesService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les exercices comptables' })
  findAll() {
    return this.service.findAll();
  }

  @Get('ouvert')
  @ApiOperation({ summary: "Retourne l'exercice actuellement ouvert" })
  findOuvert() {
    return this.service.findOuvert();
  }

  @Post()
  @ApiOperation({ summary: 'Ouvrir un nouvel exercice pour une année donnée' })
  create(@Body('annee') annee: number) {
    return this.service.create(annee);
  }

  @Patch(':id/cloturer')
  @ApiOperation({ summary: 'Clôturer un exercice (verrouille toutes ses écritures)' })
  cloturer(@Param('id', ParseIntPipe) id: number) {
    return this.service.cloturer(id);
  }
}
